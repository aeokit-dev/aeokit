import type { Job } from "pg-boss";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  analyzeEvidence,
  classifyCitation,
  createProviderRegistry,
  generateReliabilityOpportunity,
  generateRunOpportunities,
  normalizeCitationUrl,
  normalizeDomain,
  type ProviderId,
} from "@openaeo/core";
import {
  citations,
  claims,
  competitors,
  db,
  opportunities,
  projects,
  promptRuns,
  prompts,
  promptTargets,
} from "@openaeo/db";
import { isRetryableProviderError, retryWithBackoff } from "./retry";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const providerMaxAttempts = positiveInteger(
  process.env.PROVIDER_MAX_ATTEMPTS,
  3,
);
const providerRetryBaseDelayMs = positiveInteger(
  process.env.PROVIDER_RETRY_BASE_DELAY_MS,
  2_000,
);
const providerTimeoutMs = positiveInteger(
  process.env.PROVIDER_TIMEOUT_MS,
  225_000,
);

async function refreshReliabilityOpportunity(
  projectId: string,
  provider: string,
): Promise<void> {
  const observations = await db
    .select({ runId: promptRuns.id, status: promptRuns.status })
    .from(promptRuns)
    .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
    .where(
      and(
        eq(prompts.projectId, projectId),
        eq(promptRuns.provider, provider),
        inArray(promptRuns.status, ["succeeded", "failed"]),
      ),
    )
    .orderBy(desc(promptRuns.completedAt))
    .limit(5);
  const draft = generateReliabilityOpportunity({
    projectId,
    provider,
    observations: observations.map((observation) => ({
      ...observation,
      status: observation.status as "succeeded" | "failed",
    })),
  });
  const observedAt = new Date();
  if (!draft) {
    await db
      .update(opportunities)
      .set({
        status: "resolved",
        evidenceIds: [],
        affectedPromptIds: [],
        lastSeenAt: observedAt,
      })
      .where(
        and(
          eq(
            opportunities.fingerprint,
            `reliability_warning:${projectId}:${provider}`,
          ),
          inArray(opportunities.status, ["open", "in_progress"]),
        ),
      );
    return;
  }
  await db
    .insert(opportunities)
    .values({
      projectId,
      ...draft,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
    })
    .onConflictDoUpdate({
      target: [opportunities.projectId, opportunities.fingerprint],
      set: {
        priority: draft.priority,
        confidence: draft.confidence,
        earlySignal: draft.earlySignal,
        title: draft.title,
        explanation: draft.explanation,
        recommendedAction: draft.recommendedAction,
        evidenceIds: draft.evidenceIds,
        affectedPromptIds: draft.affectedPromptIds,
        affectedUrls: draft.affectedUrls,
        lastSeenAt: observedAt,
      },
    });
}

export interface RunTargetData {
  id: string;
  provider: string;
  model: string;
  webSearch: boolean;
}

export interface RunPromptData {
  promptId: string;
  runId?: string;
  target?: RunTargetData;
}

export async function processPromptJobs(
  jobs: Job<RunPromptData>[],
): Promise<void> {
  for (const job of jobs) await processPrompt(job.data);
}

async function processPrompt(data: RunPromptData): Promise<void> {
  const { promptId } = data;
  const prompt = await db.query.prompts.findFirst({
    where: eq(prompts.id, promptId),
  });
  if (!prompt || !prompt.enabled) {
    if (data.runId) {
      await db
        .update(promptRuns)
        .set({
          status: "cancelled",
          error: prompt
            ? "The prompt was disabled before this run could resume"
            : "The prompt was deleted before this run could resume",
          completedAt: new Date(),
          dedupeKey: null,
        })
        .where(eq(promptRuns.id, data.runId));
    }
    return;
  }
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, prompt.projectId),
  });
  if (!project) throw new Error(`Project ${prompt.projectId} not found`);
  const projectCompetitors = await db
    .select()
    .from(competitors)
    .where(eq(competitors.projectId, project.id));
  const targets = await db
    .select()
    .from(promptTargets)
    .where(eq(promptTargets.promptId, prompt.id));
  const registry = createProviderRegistry();

  let effectiveTargets: RunTargetData[];
  if (data.target) {
    const currentTarget = targets.find(
      (target) => target.id === data.target?.id,
    );
    if (!currentTarget || currentTarget.promptId !== prompt.id) {
      if (data.runId) {
        await db
          .update(promptRuns)
          .set({
            status: "cancelled",
            error: "The provider target changed before this run could resume",
            completedAt: new Date(),
            dedupeKey: null,
          })
          .where(eq(promptRuns.id, data.runId));
      }
      return;
    }
    effectiveTargets = [currentTarget];
  } else {
    effectiveTargets = targets.length
      ? targets
      : [...registry.values()]
          .filter((provider) => provider.configured)
          .map((provider) => ({
            id: "",
            provider: provider.id,
            model: provider.defaultModel,
            webSearch: true,
          }));
  }

  if (effectiveTargets.length === 0) {
    throw new Error("No provider targets are configured for this prompt");
  }

  for (const target of effectiveTargets) {
    const provider = registry.get(target.provider as ProviderId);
    const resumedRun = data.runId
      ? await db.query.promptRuns.findFirst({
          where: eq(promptRuns.id, data.runId),
        })
      : undefined;
    const [createdRun] = resumedRun
      ? [undefined]
      : await db
          .insert(promptRuns)
          .values({
            promptId: prompt.id,
            promptTargetId: target.id || null,
            provider: target.provider,
            model: target.model,
            status: "running",
          })
          .returning();
    const run = resumedRun ?? createdRun;
    if (!run) throw new Error("Run insert returned no row");
    if (
      run.promptId !== prompt.id ||
      run.provider !== target.provider ||
      run.model !== target.model
    ) {
      throw new Error(`Recovered run ${run.id} does not match its target`);
    }

    await db
      .update(promptRuns)
      .set({ status: "running", error: null, completedAt: null })
      .where(eq(promptRuns.id, run.id));

    let resumeToken = run.providerJobId;
    try {
      const result = await retryWithBackoff(
        async () => {
          if (!provider)
            throw new Error(`Unknown provider: ${target.provider}`);
          if (!provider.configured)
            throw new Error(`${provider.label} is not configured`);

          const controller = new AbortController();
          const timeout = setTimeout(
            () =>
              controller.abort(
                new Error(
                  `${provider.label} timed out after ${providerTimeoutMs}ms`,
                ),
              ),
            providerTimeoutMs,
          );
          try {
            return await provider.run(prompt.value, {
              model: target.model,
              webSearch: target.webSearch,
              signal: controller.signal,
              ...(resumeToken ? { resumeToken } : {}),
              onResumeToken: async (token) => {
                resumeToken = token;
                await db
                  .update(promptRuns)
                  .set({ providerJobId: token })
                  .where(eq(promptRuns.id, run.id));
              },
            });
          } finally {
            clearTimeout(timeout);
          }
        },
        {
          maxAttempts: providerMaxAttempts,
          startingAttempt: run.attemptCount,
          baseDelayMs: providerRetryBaseDelayMs,
          shouldRetry: isRetryableProviderError,
          onAttempt: async ({ attempt }) => {
            await db
              .update(promptRuns)
              .set({ attemptCount: attempt, lastAttemptAt: new Date() })
              .where(eq(promptRuns.id, run.id));
          },
        },
      );
      const brandDomains = [
        normalizeDomain(project.website),
        ...project.additionalDomains,
      ];
      const analysis = analyzeEvidence(
        result.answer,
        {
          name: project.name,
          aliases: project.aliases,
          domains: brandDomains,
        },
        projectCompetitors,
      );
      const normalizedCitations = result.citations.map((citation) => {
        const normalized = normalizeCitationUrl(citation);
        const classification = classifyCitation(
          normalized.domain,
          brandDomains,
          projectCompetitors,
        );
        return { ...normalized, ...classification };
      });
      const previousRuns = await db
        .select({ provider: promptRuns.provider })
        .from(promptRuns)
        .where(
          and(
            eq(promptRuns.promptId, prompt.id),
            eq(promptRuns.status, "succeeded"),
          ),
        )
        .orderBy(desc(promptRuns.completedAt))
        .limit(19);
      const opportunityDrafts = generateRunOpportunities({
        projectId: project.id,
        promptId: prompt.id,
        runId: run.id,
        provider: result.provider,
        analysis,
        citations: normalizedCitations,
        observationCount: previousRuns.length + 1,
        agreeingProviders: new Set([
          result.provider,
          ...previousRuns.map((item) => item.provider),
        ]).size,
      });
      const completedAt = new Date();

      await db.transaction(async (transaction) => {
        await transaction
          .update(promptRuns)
          .set({
            status: "succeeded",
            answer: result.answer,
            rawOutput: result.raw,
            brandMentioned: analysis.brandMentioned,
            recommendationRank: analysis.recommendationRank,
            recommendationStrength: analysis.recommendationStrength,
            sentiment: analysis.sentiment,
            competitorsMentioned: analysis.competitorsMentioned,
            webQueries: result.webQueries,
            error: null,
            latencyMs: result.latencyMs,
            costUsd: result.costUsd,
            model: result.model,
            completedAt,
            dedupeKey: null,
          })
          .where(eq(promptRuns.id, run.id));

        await transaction.delete(citations).where(eq(citations.runId, run.id));
        await transaction.delete(claims).where(eq(claims.runId, run.id));
        if (normalizedCitations.length) {
          await transaction.insert(citations).values(
            normalizedCitations.map((citation) => ({
              runId: run.id,
              url: citation.canonicalUrl,
              rawUrl: citation.rawUrl,
              finalUrl: citation.finalUrl,
              canonicalUrl: citation.canonicalUrl,
              domain: citation.domain,
              title: citation.pageTitle ?? null,
              position: citation.position,
              category: citation.category,
              competitorName: citation.competitorName ?? null,
            })),
          );
        }
        if (analysis.claims.length) {
          await transaction.insert(claims).values(
            analysis.claims.map((claim) => ({
              projectId: project.id,
              runId: run.id,
              text: claim.text,
              confidence: Math.round(claim.confidence * 100),
            })),
          );
        }
        for (const draft of opportunityDrafts) {
          await transaction
            .insert(opportunities)
            .values({
              projectId: project.id,
              ...draft,
              firstSeenAt: completedAt,
              lastSeenAt: completedAt,
            })
            .onConflictDoUpdate({
              target: [opportunities.projectId, opportunities.fingerprint],
              set: {
                priority: draft.priority,
                confidence: draft.confidence,
                earlySignal: draft.earlySignal,
                title: draft.title,
                explanation: draft.explanation,
                recommendedAction: draft.recommendedAction,
                evidenceIds: draft.evidenceIds,
                affectedPromptIds: draft.affectedPromptIds,
                affectedUrls: draft.affectedUrls,
                lastSeenAt: completedAt,
              },
            });
        }
      });
      try {
        await refreshReliabilityOpportunity(project.id, result.provider);
      } catch (reliabilityError) {
        console.error(
          `Unable to refresh ${result.provider} reliability opportunity`,
          reliabilityError,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const currentRun = await db.query.promptRuns.findFirst({
        where: eq(promptRuns.id, run.id),
      });
      if (currentRun?.status !== "succeeded") {
        await db
          .update(promptRuns)
          .set({
            status: "failed",
            error: message,
            completedAt: new Date(),
            dedupeKey: null,
          })
          .where(eq(promptRuns.id, run.id));
      }
      try {
        await refreshReliabilityOpportunity(project.id, target.provider);
      } catch (reliabilityError) {
        console.error(
          `Unable to refresh ${target.provider} reliability opportunity`,
          reliabilityError,
        );
      }
      console.error(`Run ${run.id} failed: ${message}`);
    }
  }
}

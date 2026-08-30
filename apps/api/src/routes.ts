import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  sql as drizzleSql,
} from "drizzle-orm";
import {
  aiChatMessages,
  aiChatSessions,
  citations,
  competitorSuggestionDismissals,
  competitors,
  crawlerTrafficDaily,
  db,
  opportunities,
  projects,
  reportAuditEvents,
  reportRedirects,
  promptRuns,
  prompts,
  promptTargets,
  workerHeartbeats,
} from "@openaeo/db";
import {
  attachTrackedCitations,
  aiChatTitle,
  brightDataModelOptions,
  brightDataPromptLimit,
  buildShareOfVoiceReport,
  buildAiChatMetrics,
  citationSurfaceCoverage,
  buildAiChatSystemPrompt,
  fetchPostHogAiReferrals,
  citationRate,
  configuredAiChatBackends,
  discoverCompetitors,
  createProviderRegistry,
  generateReliabilityOpportunity,
  dataForSeoModelOptions,
  dataForSeoPromptLimit,
  isBrightDataTarget,
  isDataForSeoTarget,
  metricSummary,
  mentionRate,
  hasMateriallyNewEvidence,
  normalizeCompetitorKey,
  postHogReferralsConfiguration,
  buildFallbackPromptSuggestions,
  buildPromptSuggestionInstructions,
  normalizePrompt,
  parsePromptSuggestionResponse,
  promptsAreNearDuplicates,
  providerCoverage,
  runOpenRouterChat,
  shareOfVoice,
  visibilityScore,
  visibilityTrend,
  type AiReferralPeriod,
  type MetricRun,
  type ProviderId,
} from "@openaeo/core";
import { getQueue } from "./queue";
import {
  runDetail,
  runSummary,
  shouldShowProviderCosts,
} from "./cost-visibility";
import { CloudflareCrawlerTrafficClient } from "@openaeo/cloudflare-analytics";
import { createCrawlerTrafficRoutes } from "./crawler-traffic-route";
import { renderPublicReportHtml, slugify } from "./public-report";
import { loadPublicReport } from "./public-report-routes";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const workerHealthStaleMs = positiveInteger(
  process.env.WORKER_HEALTH_STALE_MS,
  45_000,
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
      set: { ...draft, lastSeenAt: observedAt },
    });
}

async function latestProviderRun(
  provider: ProviderId,
  status: "succeeded" | "failed",
  projectId?: string,
) {
  const [row] = await db
    .select({
      completedAt: promptRuns.completedAt,
      error: promptRuns.error,
    })
    .from(promptRuns)
    .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
    .where(
      projectId
        ? and(
            eq(promptRuns.provider, provider),
            eq(promptRuns.status, status),
            eq(prompts.projectId, projectId),
          )
        : and(eq(promptRuns.provider, provider), eq(promptRuns.status, status)),
    )
    .orderBy(desc(promptRuns.completedAt))
    .limit(1);
  return row;
}

const projectInput = z.object({
  name: z.string().trim().min(1).max(120),
  website: z.string().url(),
  aliases: z.array(z.string().trim().min(1)).default([]),
  additionalDomains: z.array(z.string().trim().min(1)).default([]),
});
export const reportSettingsInput = z.object({
  category: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  staleAfterDays: z.number().int().min(1).max(365).default(30),
  published: z.boolean(),
  sections: z.object({
    prompts: z.boolean(),
    answers: z.boolean(),
    competitors: z.boolean(),
    citations: z.boolean(),
    costs: z.boolean(),
  }),
});

const httpUrl = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Website must use http:// or https://");

export const competitorInput = z.object({
  name: z.string().trim().min(1).max(120),
  website: httpUrl.nullable().optional(),
  aliases: z.array(z.string().trim().min(1)).default([]),
  domains: z.array(z.string().trim().min(1)).default([]),
});
const discoveryRangeInput = z.enum(["30d", "90d", "365d", "all"]);
export const competitorProjectIdInput = z.string().uuid();
export const competitorDiscoverySettingsInput = z.object({
  range: discoveryRangeInput.default("90d"),
  minimumMentions: z.coerce.number().int().min(2).max(10).default(2),
});
const suggestionEvidenceInput = z.object({
  key: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).default([]),
  mentionCount: z.number().int().positive(),
  promptCount: z.number().int().positive(),
  providerCount: z.number().int().positive(),
});
export const competitorApprovalInput = z.object({
  suggestions: z.array(suggestionEvidenceInput).min(1).max(50),
});
export const competitorDismissalInput = suggestionEvidenceInput
  .pick({
    mentionCount: true,
    promptCount: true,
    providerCount: true,
  })
  .extend({
    evidenceRunIds: z.array(z.string().uuid()).min(1).max(500),
    evidencePromptIds: z.array(z.string().uuid()).min(1).max(500),
    evidenceProviders: z.array(z.string().trim().min(1)).min(1).max(20),
  });

function discoveryStart(
  range: z.infer<typeof discoveryRangeInput>,
): Date | null {
  if (range === "all") return null;
  return new Date(Date.now() - Number.parseInt(range, 10) * 86_400_000);
}

/**
 * A bounded sample for callers that cannot read the whole window.
 *
 * Runs complete in batches, so the newest N rows come from the tail of one
 * batch — a handful of prompts, often one provider. discoverCompetitors only
 * keeps a candidate seen across two prompts or two providers, so a
 * newest-N sample would drop candidates precisely on the busiest projects.
 * Taking each prompt's most recent answer first spreads the sample across
 * prompts instead.
 */
async function sampledDiscoveryRuns(
  projectId: string,
  start: Date | null,
  maxAnswers: number,
) {
  const ranked = db
    .select({
      id: promptRuns.id,
      promptId: promptRuns.promptId,
      prompt: prompts.value,
      provider: promptRuns.provider,
      model: promptRuns.model,
      answer: promptRuns.answer,
      completedAt: promptRuns.completedAt,
      rank: drizzleSql<number>`row_number() over (partition by ${promptRuns.promptId} order by ${promptRuns.completedAt} desc)`.as(
        "rank",
      ),
    })
    .from(promptRuns)
    .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
    .where(
      and(
        eq(prompts.projectId, projectId),
        eq(promptRuns.status, "succeeded"),
        isNotNull(promptRuns.completedAt),
        ...(start ? [gte(promptRuns.completedAt, start)] : []),
      ),
    )
    .as("ranked");
  return db
    .select({
      id: ranked.id,
      promptId: ranked.promptId,
      prompt: ranked.prompt,
      provider: ranked.provider,
      model: ranked.model,
      answer: ranked.answer,
      completedAt: ranked.completedAt,
    })
    .from(ranked)
    .orderBy(drizzleSql`"ranked"."rank"`, desc(ranked.completedAt))
    .limit(maxAnswers);
}

async function competitorDiscovery(
  projectId: string,
  range: z.infer<typeof discoveryRangeInput>,
  minimumMentions: number,
  // Caps how many answers the pass reads. The Competitors page wants the whole
  // window; callers on a hot path must bound the work.
  maxAnswers?: number,
) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) return null;
  const tracked = await db
    .select()
    .from(competitors)
    .where(eq(competitors.projectId, projectId));
  const start = discoveryStart(range);
  const runRows = maxAnswers
    ? await sampledDiscoveryRuns(projectId, start, maxAnswers)
    : await db
        .select({
          id: promptRuns.id,
          promptId: prompts.id,
          prompt: prompts.value,
          provider: promptRuns.provider,
          model: promptRuns.model,
          answer: promptRuns.answer,
          completedAt: promptRuns.completedAt,
        })
        .from(promptRuns)
        .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
        .where(
          and(
            eq(prompts.projectId, projectId),
            eq(promptRuns.status, "succeeded"),
            ...(start ? [gte(promptRuns.completedAt, start)] : []),
          ),
        );
  const result = discoverCompetitors({
    runs: runRows.flatMap((run) =>
      run.answer && run.completedAt
        ? [
            {
              ...run,
              answer: run.answer,
              completedAt: run.completedAt.toISOString(),
            },
          ]
        : [],
    ),
    brand: project,
    existingCompetitors: tracked,
    minimumMentions,
  });
  const dismissals = await db
    .select()
    .from(competitorSuggestionDismissals)
    .where(eq(competitorSuggestionDismissals.projectId, projectId));
  const dismissed = new Map(
    dismissals.map((item) => [item.normalizedName, item]),
  );
  return {
    range,
    answersAnalyzed: result.answersAnalyzed,
    providerQueryCostUsd: 0,
    expectedAdditionalRuns: 0,
    suggestions: result.suggestions.filter((suggestion) => {
      const prior = dismissed.get(suggestion.key);
      return !prior || hasMateriallyNewEvidence(prior, suggestion);
    }),
  };
}

const targetInput = z
  .object({
    provider: z.enum([
      "brightdata",
      "openai",
      "anthropic",
      "openrouter",
      "dataforseo",
    ]),
    model: z.string().trim().min(1),
    webSearch: z.boolean().default(true),
  })
  .superRefine((target, context) => {
    if (target.provider === "dataforseo" && !isDataForSeoTarget(target.model)) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: `DataForSEO supports: ${dataForSeoModelOptions.map((option) => option.id).join(", ")}`,
      });
    }
    if (target.provider === "brightdata" && !isBrightDataTarget(target.model)) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: `Bright Data supports: ${brightDataModelOptions.map((option) => option.id).join(", ")}`,
      });
    }
  });

const promptFields = {
  value: z.string().trim().min(5).max(2_000),
  tags: z.array(z.string().trim().min(1)),
  enabled: z.boolean(),
  cadenceMinutes: z.union([z.literal(1_440), z.literal(10_080)]),
  targets: z.array(targetInput).min(1),
};

const promptInput = z
  .object({
    ...promptFields,
    tags: promptFields.tags.default([]),
    enabled: promptFields.enabled.default(true),
    cadenceMinutes: promptFields.cadenceMinutes.default(1_440),
  })
  .superRefine((prompt, context) => {
    const promptLength = Array.from(prompt.value).length;
    for (const [index, target] of prompt.targets.entries()) {
      const limit =
        target.provider === "brightdata"
          ? brightDataPromptLimit(target.model)
          : target.provider === "dataforseo"
            ? dataForSeoPromptLimit(target.model)
            : null;
      if (limit === null) continue;
      if (promptLength <= limit) continue;
      context.addIssue({
        code: "custom",
        path: ["targets", index, "model"],
        message: `${target.provider === "brightdata" ? "Bright Data" : "DataForSEO"} ${target.model} prompts must be ${limit} characters or fewer`,
      });
    }
  });

export const promptUpdateInput = z.object(promptFields).partial();

const promptSuggestionContextInput = z.object({
  category: z.string().trim().max(200).default(""),
  subcategories: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  audiences: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  geography: z.string().trim().max(120).default(""),
  language: z.string().trim().min(1).max(80).default("English"),
  competitors: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  additionalContext: z.string().trim().max(2_000).default(""),
  count: z.number().int().min(5).max(30).default(12),
  model: z.string().trim().min(1).max(200).optional(),
});

const promptSuggestionInput = z.object({
  value: z.string().trim().min(5).max(2_000),
  intent: z.enum([
    "category_discovery",
    "use_case",
    "audience_industry",
    "comparison",
    "alternatives",
    "evaluation",
    "transactional",
  ]),
  branded: z.boolean(),
});

const promptSuggestionApprovalInput = z.object({
  suggestions: z.array(promptSuggestionInput).min(1).max(30),
  metadata: z.record(z.string(), z.unknown()),
  cadenceMinutes: promptFields.cadenceMinutes.default(1_440),
  targets: z.array(targetInput).min(1),
});

const aiReferralPeriodInput = z.enum(["7d", "30d", "90d"]);
const opportunityTypeInput = z.enum([
  "citation_gap",
  "content_authority",
  "winning_message",
  "competitor_advantage",
  "unsupported_claim",
  "reliability_warning",
]);
const opportunityStatusInput = z.enum([
  "open",
  "in_progress",
  "resolved",
  "dismissed",
]);
export const opportunityUpdateInput = z
  .object({
    status: opportunityStatusInput.optional(),
    completedActionIndices: z
      .array(z.number().int().min(0).max(3))
      .max(4)
      .refine((values) => new Set(values).size === values.length)
      .optional(),
    dueAt: z.string().datetime().nullable().optional(),
    relatedOpportunityIds: z.array(z.string().uuid()).max(49).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.status !== undefined ||
      value.completedActionIndices !== undefined ||
      value.dueAt !== undefined,
  );

const aiChatUiContextInput = z
  .object({
    route: z.string().max(500),
    page: z.string().max(200),
    projectId: z.string().max(200).optional(),
    organizationId: z.string().max(200).optional(),
    visibleState: z.record(z.string().max(100), z.string().max(500)).optional(),
    insights: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            label: z.string().min(1).max(200),
            page: z.string().max(200).optional(),
            value: z.string().max(500).optional(),
            text: z.string().min(1).max(1_200),
          })
          .strict(),
      )
      .max(40),
  })
  .strict()
  .refine(
    (value) => JSON.stringify(value).length <= 32_000,
    "UI context is too large",
  );
export const aiChatMessageInput = z
  .object({
    content: z.string().trim().min(1).max(8_000),
    backend: z.enum(["local", "openrouter"]).optional(),
    uiContext: aiChatUiContextInput.optional(),
  })
  .strict();

function periodStart(period: string | undefined): Date {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
}

function comparisonPeriod(period: "7d" | "30d" | "90d") {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const currentEnd = new Date();
  const currentStart = new Date(
    currentEnd.getTime() - days * 24 * 60 * 60 * 1_000,
  );
  const previousStart = new Date(
    currentStart.getTime() - days * 24 * 60 * 60 * 1_000,
  );
  return { currentStart, currentEnd, previousStart };
}

async function listPrompts(projectId: string) {
  const rows = await db
    .select()
    .from(prompts)
    .where(eq(prompts.projectId, projectId))
    .orderBy(desc(prompts.createdAt));
  if (rows.length === 0) return [];
  const targets = await db
    .select()
    .from(promptTargets)
    .where(
      inArray(
        promptTargets.promptId,
        rows.map((row) => row.id),
      ),
    );
  const latestRuns = await db
    .select({
      promptId: promptRuns.promptId,
      lastRunAt: drizzleSql<Date>`max(${promptRuns.createdAt})`,
    })
    .from(promptRuns)
    .where(
      inArray(
        promptRuns.promptId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(promptRuns.promptId);
  const activeRuns = await db
    .selectDistinct({ promptId: promptRuns.promptId })
    .from(promptRuns)
    .where(
      and(
        inArray(
          promptRuns.promptId,
          rows.map((row) => row.id),
        ),
        inArray(promptRuns.status, ["pending", "running"]),
      ),
    );
  const activePromptIds = new Set(activeRuns.map((run) => run.promptId));
  return rows.map((prompt) => ({
    ...prompt,
    targets: targets.filter((target) => target.promptId === prompt.id),
    lastRunAt:
      latestRuns.find((run) => run.promptId === prompt.id)?.lastRunAt ?? null,
    hasActiveRun: activePromptIds.has(prompt.id),
  }));
}

function answerExcerpt(answer: string | null): string | null {
  if (!answer) return null;
  const characters = Array.from(answer);
  return characters.length > 2_500
    ? `${characters.slice(0, 2_499).join("")}…`
    : answer;
}

const aiChatRunSampleSize = 12;
const aiChatMetricsPeriodDays = 30;
const aiChatPendingCompetitorLimit = 8;
const aiChatDiscoveryRange = "90d" as const;
const aiChatDiscoveryAnswerLimit = 50;

async function aiChatProjectContext(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) return null;

  const metricsWindow = new Date(
    Date.now() - aiChatMetricsPeriodDays * 24 * 60 * 60 * 1000,
  );
  const [
    projectCompetitors,
    trackedPrompts,
    recentRuns,
    periodRuns,
    projectTargets,
    promptTagRows,
    suggestions,
  ] = await Promise.all([
    db
      .select({
        name: competitors.name,
        website: competitors.website,
        aliases: competitors.aliases,
        domains: competitors.domains,
      })
      .from(competitors)
      .where(eq(competitors.projectId, projectId))
      .orderBy(competitors.name),
    db
      .select({
        value: prompts.value,
        tags: prompts.tags,
        enabled: prompts.enabled,
      })
      .from(prompts)
      .where(eq(prompts.projectId, projectId))
      .orderBy(desc(prompts.updatedAt))
      .limit(50),
    db
      .select({
        prompt: prompts.value,
        provider: promptRuns.provider,
        model: promptRuns.model,
        answer: promptRuns.answer,
        brandMentioned: promptRuns.brandMentioned,
        competitorsMentioned: promptRuns.competitorsMentioned,
        completedAt: promptRuns.completedAt,
      })
      .from(promptRuns)
      .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
      .where(
        and(
          eq(prompts.projectId, projectId),
          eq(promptRuns.status, "succeeded"),
          gte(promptRuns.createdAt, metricsWindow),
        ),
      )
      .orderBy(desc(promptRuns.completedAt))
      .limit(aiChatRunSampleSize),
    // Every run in the window, failures included — the aggregates and the
    // surface list have to agree with the Dashboard, which counts failures.
    db
      .select({
        provider: promptRuns.provider,
        model: promptRuns.model,
        status: promptRuns.status,
        brandMentioned: promptRuns.brandMentioned,
      })
      .from(promptRuns)
      .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
      .where(
        and(
          eq(prompts.projectId, projectId),
          gte(promptRuns.createdAt, metricsWindow),
        ),
      ),
    db
      .selectDistinct({
        provider: promptTargets.provider,
        model: promptTargets.model,
      })
      .from(promptTargets)
      .innerJoin(prompts, eq(promptTargets.promptId, prompts.id))
      .where(eq(prompts.projectId, projectId))
      .orderBy(promptTargets.provider, promptTargets.model),
    db
      .select({ tags: prompts.tags })
      .from(prompts)
      .where(eq(prompts.projectId, projectId)),
    // Bounded on purpose: this runs per chat message, and the unbounded pass
    // reads every answer in the window. Best-effort, because a chat message
    // must not fail when the suggestion pass does.
    competitorDiscovery(
      projectId,
      aiChatDiscoveryRange,
      2,
      aiChatDiscoveryAnswerLimit,
    ).catch((error: unknown) => {
      console.error("AI chat competitor discovery failed", error);
      return null;
    }),
  ]);

  return {
    project: {
      name: project.name,
      website: project.website,
      aliases: project.aliases,
      additionalDomains: project.additionalDomains,
    },
    ...buildAiChatMetrics({
      periodDays: aiChatMetricsPeriodDays,
      runs: periodRuns,
      targets: projectTargets,
      promptTags: promptTagRows.map((prompt) => prompt.tags),
    }),
    competitors: projectCompetitors,
    pendingCompetitors: (suggestions?.suggestions ?? [])
      .slice(0, aiChatPendingCompetitorLimit)
      .map((suggestion) => suggestion.name),
    trackedPrompts,
    recentRunsSample: {
      sampleSize: recentRuns.length,
      totalSuccessfulRuns: periodRuns.filter(
        (run) => run.status === "succeeded",
      ).length,
      runs: recentRuns.map((run) => ({
        ...run,
        answer: answerExcerpt(run.answer),
        completedAt: run.completedAt?.toISOString() ?? null,
      })),
    },
    integrations: {
      posthogConfigured: postHogReferralsConfiguration(process.env).configured,
    },
  };
}

export function createApiRoutes() {
  const api = new Hono();
  const showProviderCosts = shouldShowProviderCosts();
  const cloudflareCrawlerTraffic = new CloudflareCrawlerTrafficClient({
    token: process.env.CLOUDFLARE_API_TOKEN ?? "",
  });

  api.route(
    "/",
    createCrawlerTrafficRoutes({
      findProject: async (projectId) => {
        const project = await db.query.projects.findFirst({
          where: eq(projects.id, projectId),
        });
        return project ? { website: project.website } : null;
      },
      getCrawlerTraffic: (website) =>
        cloudflareCrawlerTraffic.getTraffic(website),
    }),
  );

  api.get("/projects/:projectId/crawler-traffic/history", async (context) => {
    const projectId = context.req.param("projectId");
    if (!z.string().uuid().safeParse(projectId).success) {
      return context.json({ error: "Invalid project ID" }, 400);
    }
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return context.json({ error: "Project not found" }, 404);
    const rows = await db
      .select()
      .from(crawlerTrafficDaily)
      .where(eq(crawlerTrafficDaily.projectId, projectId))
      .orderBy(desc(crawlerTrafficDaily.endAt))
      .limit(90);
    return context.json({
      days: rows.map((row) => ({
        date: row.date,
        totalRequests: row.totalRequests,
        identifiedCrawlerRequests: row.identifiedCrawlerRequests,
        crawlerSharePercentage:
          row.totalRequests > 0
            ? Math.round(
                (row.identifiedCrawlerRequests / row.totalRequests) * 10_000,
              ) / 100
            : 0,
        families: row.families,
        start: row.startAt.toISOString(),
        end: row.endAt.toISOString(),
      })),
    });
  });

  api.get("/health", async (context) => {
    await db.execute(drizzleSql`select 1`);
    return context.json({ ok: true, service: "aeokit-runtime" });
  });

  api.get("/config", (context) => context.json({ showProviderCosts }));

  api.get("/providers", async (context) => {
    const projectId = context.req.query("projectId");
    if (projectId && !z.string().uuid().safeParse(projectId).success) {
      return context.json({ error: "Invalid project ID" }, 400);
    }

    const [heartbeat] = await db
      .select()
      .from(workerHeartbeats)
      .orderBy(desc(workerHeartbeats.lastSeenAt))
      .limit(1);
    const workerReady = Boolean(
      heartbeat &&
      heartbeat.status === "ready" &&
      Date.now() - heartbeat.lastSeenAt.getTime() <= workerHealthStaleMs,
    );
    const providers = await Promise.all(
      [...createProviderRegistry().values()].map(async (provider) => {
        const [lastSuccess, lastFailure] = await Promise.all([
          latestProviderRun(provider.id, "succeeded", projectId),
          latestProviderRun(provider.id, "failed", projectId),
        ]);
        const latestRunFailed = Boolean(
          lastFailure?.completedAt &&
          (!lastSuccess?.completedAt ||
            lastFailure.completedAt > lastSuccess.completedAt),
        );
        const status = !provider.configured
          ? "missing_credentials"
          : !workerReady
            ? "worker_offline"
            : latestRunFailed
              ? "failing"
              : "ready";
        return {
          id: provider.id,
          label: provider.label,
          configured: provider.configured,
          defaultModel: provider.defaultModel,
          modelOptions: provider.modelOptions ?? [],
          status,
          lastSuccessfulRunAt: lastSuccess?.completedAt ?? null,
          lastErrorAt: lastFailure?.completedAt ?? null,
          lastError: lastFailure?.error ?? null,
        };
      }),
    );
    return context.json({
      providers,
      worker: {
        status: workerReady ? "ready" : "offline",
        lastSeenAt: heartbeat?.lastSeenAt ?? null,
        startedAt: heartbeat?.startedAt ?? null,
      },
    });
  });

  api.get("/projects", async (context) => {
    const rows = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt));
    return context.json({ projects: rows });
  });

  api.get("/opportunities", async (context) => {
    const projectId = context.req.query("projectId");
    const statusValue = context.req.query("status") ?? "open";
    const typeValue = context.req.query("type");
    if (!projectId || !z.string().uuid().safeParse(projectId).success) {
      return context.json({ error: "Invalid project ID" }, 400);
    }
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return context.json({ error: "Project not found" }, 404);
    const statusResult =
      statusValue === "all"
        ? null
        : opportunityStatusInput.safeParse(statusValue);
    const typeResult = typeValue
      ? opportunityTypeInput.safeParse(typeValue)
      : null;
    if (
      (statusResult && !statusResult.success) ||
      (typeResult && !typeResult.success)
    ) {
      return context.json({ error: "Invalid opportunity filter" }, 400);
    }
    const conditions = [
      eq(opportunities.projectId, projectId),
      ...(statusResult?.success
        ? [eq(opportunities.status, statusResult.data)]
        : []),
      ...(typeResult?.success ? [eq(opportunities.type, typeResult.data)] : []),
    ];
    const rows = await db
      .select()
      .from(opportunities)
      .where(and(...conditions))
      .orderBy(desc(opportunities.priority), desc(opportunities.lastSeenAt));
    const evidenceIds = [...new Set(rows.flatMap((row) => row.evidenceIds))];
    const evidenceRows = evidenceIds.length
      ? await db
          .select({
            runId: promptRuns.id,
            provider: promptRuns.provider,
            model: promptRuns.model,
            answer: promptRuns.answer,
            createdAt: promptRuns.createdAt,
          })
          .from(promptRuns)
          .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
          .where(
            and(
              eq(prompts.projectId, projectId),
              inArray(promptRuns.id, evidenceIds),
            ),
          )
      : [];
    const evidenceById = new Map(
      evidenceRows.map((run) => [
        run.runId,
        {
          runId: run.runId,
          provider: run.provider,
          model: run.model,
          answerExcerpt: (run.answer ?? "No answer was returned.")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 600),
          createdAt: run.createdAt,
        },
      ]),
    );
    return context.json({
      opportunities: rows.map((row) => ({
        ...row,
        evidenceSummaries: row.evidenceIds
          .map((id) => evidenceById.get(id))
          .filter((evidence) => evidence !== undefined),
      })),
    });
  });

  api.patch("/opportunities/:opportunityId", async (context) => {
    const opportunityId = context.req.param("opportunityId");
    const input = opportunityUpdateInput.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!z.string().uuid().safeParse(opportunityId).success || !input.success) {
      return context.json({ error: "Invalid opportunity update" }, 400);
    }
    const existing = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, opportunityId),
    });
    if (!existing) return context.json({ error: "Opportunity not found" }, 404);
    const targetIds = [
      ...new Set([opportunityId, ...(input.data.relatedOpportunityIds ?? [])]),
    ];
    const update = {
      ...(input.data.status ? { status: input.data.status } : {}),
      ...(input.data.completedActionIndices
        ? { completedActionIndices: input.data.completedActionIndices }
        : {}),
      ...(input.data.dueAt !== undefined
        ? { dueAt: input.data.dueAt ? new Date(input.data.dueAt) : null }
        : {}),
    };
    await db
      .update(opportunities)
      .set(update)
      .where(
        and(
          eq(opportunities.projectId, existing.projectId),
          inArray(opportunities.id, targetIds),
        ),
      );
    return context.json({ ok: true });
  });

  api.post("/projects", zValidator("json", projectInput), async (context) => {
    const [project] = await db
      .insert(projects)
      .values(context.req.valid("json"))
      .returning();
    return context.json({ project }, 201);
  });

  api.post("/projects/:projectId/archive", async (context) => {
    const [project] = await db
      .update(projects)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, context.req.param("projectId")))
      .returning();
    if (!project) return context.json({ error: "Project not found" }, 404);
    return context.json({ project });
  });

  api.post("/projects/:projectId/unarchive", async (context) => {
    const [project] = await db
      .update(projects)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(projects.id, context.req.param("projectId")))
      .returning();
    if (!project) return context.json({ error: "Project not found" }, 404);
    return context.json({ project });
  });

  api.get("/projects/:projectId", async (context) => {
    const projectId = context.req.param("projectId");
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return context.json({ error: "Project not found" }, 404);
    const projectCompetitors = await db
      .select()
      .from(competitors)
      .where(eq(competitors.projectId, projectId))
      .orderBy(competitors.name);
    return context.json({
      project: { ...project, competitors: projectCompetitors },
    });
  });

  api.get("/projects/:projectId/ai-chat/sessions", async (context) => {
    const projectId = context.req.param("projectId");
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return context.json({ error: "Project not found" }, 404);
    const sessions = await db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.projectId, projectId))
      .orderBy(desc(aiChatSessions.updatedAt));
    return context.json({ sessions });
  });

  api.get("/ai-chat/backends", (context) =>
    context.json({ backends: configuredAiChatBackends(process.env) }),
  );

  api.post("/projects/:projectId/ai-chat/sessions", async (context) => {
    const projectId = context.req.param("projectId");
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return context.json({ error: "Project not found" }, 404);
    const [session] = await db
      .insert(aiChatSessions)
      .values({ projectId })
      .returning();
    if (!session) return context.json({ error: "Chat insert failed" }, 500);
    return context.json({ session }, 201);
  });

  api.get("/ai-chat/sessions/:sessionId/messages", async (context) => {
    const sessionId = context.req.param("sessionId");
    const session = await db.query.aiChatSessions.findFirst({
      where: eq(aiChatSessions.id, sessionId),
    });
    if (!session) return context.json({ error: "Chat not found" }, 404);
    const messages = await db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, sessionId))
      .orderBy(aiChatMessages.createdAt);
    return context.json({ messages });
  });

  api.post(
    "/ai-chat/sessions/:sessionId/messages",
    zValidator("json", aiChatMessageInput),
    async (context) => {
      const sessionId = context.req.param("sessionId");
      const session = await db.query.aiChatSessions.findFirst({
        where: eq(aiChatSessions.id, sessionId),
      });
      if (!session) return context.json({ error: "Chat not found" }, 404);
      const input = context.req.valid("json");
      const backends = configuredAiChatBackends(process.env);
      const backend =
        input.backend ??
        backends.find((item) => item.id === "local")?.id ??
        "openrouter";
      if (!backends.some((item) => item.id === backend)) {
        return context.json(
          {
            error: `${backend === "local" ? "Local AI Chat" : "OpenRouter"} is not configured`,
          },
          503,
        );
      }

      const projectContext = await aiChatProjectContext(session.projectId);
      if (!projectContext) {
        return context.json({ error: "Project not found" }, 404);
      }
      const history = await db
        .select({ role: aiChatMessages.role, content: aiChatMessages.content })
        .from(aiChatMessages)
        .where(eq(aiChatMessages.sessionId, sessionId))
        .orderBy(desc(aiChatMessages.createdAt))
        .limit(24);
      const uiContext = input.uiContext
        ? {
            ...input.uiContext,
            projectId: session.projectId,
            organizationId: undefined,
          }
        : undefined;

      try {
        const result = await runOpenRouterChat({
          environment: process.env,
          backend,
          system: buildAiChatSystemPrompt(projectContext, uiContext),
          ...(uiContext ? { uiContext } : {}),
          createPrompts: async (values) => {
            const uniqueValues = values.filter(
              (value, index, all) =>
                all.findIndex(
                  (candidate) =>
                    normalizePrompt(candidate) === normalizePrompt(value),
                ) === index,
            );
            const created = await db.transaction(async (transaction) => {
              const rows: string[] = [];
              for (const value of uniqueValues) {
                const [prompt] = await transaction
                  .insert(prompts)
                  .values({
                    projectId: session.projectId,
                    value,
                    normalizedValue: normalizePrompt(value),
                    tags: ["ai-chat"],
                    enabled: true,
                    cadenceMinutes: 360,
                  })
                  .onConflictDoNothing({
                    target: [prompts.projectId, prompts.normalizedValue],
                  })
                  .returning();
                if (!prompt) continue;
                await transaction.insert(promptTargets).values({
                  promptId: prompt.id,
                  provider: "brightdata",
                  model: "chatgpt",
                  webSearch: true,
                });
                rows.push(prompt.value);
              }
              return rows;
            });
            return {
              created,
              skipped: uniqueValues.filter((value) => !created.includes(value)),
            };
          },
          messages: [
            ...history.reverse(),
            { role: "user", content: input.content },
          ],
        });
        const title =
          session.title === "New chat"
            ? aiChatTitle(input.content)
            : session.title;
        const userCreatedAt = new Date();
        const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1);
        const [userMessage, assistantMessage] = await db.transaction(
          async (transaction) => {
            const inserted = await transaction
              .insert(aiChatMessages)
              .values([
                {
                  sessionId,
                  role: "user",
                  content: input.content,
                  createdAt: userCreatedAt,
                },
                {
                  sessionId,
                  role: "assistant",
                  content: result.answer,
                  citations: result.citations,
                  model: result.model,
                  createdAt: assistantCreatedAt,
                },
              ])
              .returning();
            await transaction
              .update(aiChatSessions)
              .set({ title, updatedAt: assistantCreatedAt })
              .where(eq(aiChatSessions.id, sessionId));
            return inserted;
          },
        );
        return context.json({
          session: { ...session, title, updatedAt: assistantCreatedAt },
          userMessage,
          assistantMessage,
          uiActions: result.uiActions,
        });
      } catch (error) {
        console.error(
          "OpenRouter chat failed",
          error instanceof Error ? error.message : "Unknown error",
        );
        return context.json(
          { error: "OpenRouter could not complete this chat request" },
          502,
        );
      }
    },
  );

  api.delete("/ai-chat/sessions/:sessionId", async (context) => {
    const [session] = await db
      .delete(aiChatSessions)
      .where(eq(aiChatSessions.id, context.req.param("sessionId")))
      .returning({ id: aiChatSessions.id });
    if (!session) return context.json({ error: "Chat not found" }, 404);
    return context.body(null, 204);
  });

  api.get("/projects/:projectId/ai-referrals", async (context) => {
    const projectId = context.req.param("projectId");
    const periodResult = aiReferralPeriodInput.safeParse(
      context.req.query("period") ?? "30d",
    );
    if (!periodResult.success) {
      return context.json({ error: "Period must be 7d, 30d, or 90d" }, 400);
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return context.json({ error: "Project not found" }, 404);

    const configuration = postHogReferralsConfiguration(process.env);
    if (!configuration.configured) {
      return context.json({
        configured: false as const,
        missing: configuration.missing,
      });
    }

    try {
      const data = await fetchPostHogAiReferrals({
        environment: process.env,
        website: project.website,
        period: periodResult.data as AiReferralPeriod,
      });
      const citationRows = await db
        .select({ url: citations.url })
        .from(citations)
        .innerJoin(promptRuns, eq(citations.runId, promptRuns.id))
        .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
        .where(
          and(
            eq(prompts.projectId, projectId),
            gte(citations.createdAt, periodStart(periodResult.data)),
          ),
        );
      return context.json({
        configured: true as const,
        data: attachTrackedCitations(
          data,
          citationRows.map((citation) => citation.url),
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return context.json({ error: message }, 502);
    }
  });

  api.patch(
    "/projects/:projectId",
    zValidator("json", projectInput.partial()),
    async (context) => {
      const [project] = await db
        .update(projects)
        .set({ ...context.req.valid("json"), updatedAt: new Date() })
        .where(eq(projects.id, context.req.param("projectId")))
        .returning();
      if (!project) return context.json({ error: "Project not found" }, 404);
      return context.json({ project });
    },
  );

  api.put("/projects/:projectId/public-report", async (context) => {
    const input = reportSettingsInput.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success)
      return context.json({ error: "Invalid report settings" }, 400);
    const existing = await db.query.projects.findFirst({
      where: eq(projects.id, context.req.param("projectId")),
    });
    if (!existing) return context.json({ error: "Project not found" }, 404);
    const reportSlug =
      input.data.slug ??
      existing.reportSlug ??
      `${slugify(existing.name)}-ai-visibility`;
    const category = input.data.category.toLowerCase();
    const [project] = await db.transaction(async (tx) => {
      if (
        existing.reportSlug &&
        existing.category &&
        (existing.reportSlug !== reportSlug || existing.category !== category)
      )
        await tx
          .insert(reportRedirects)
          .values({
            projectId: existing.id,
            categorySlug: slugify(existing.category),
            reportSlug: existing.reportSlug,
          })
          .onConflictDoNothing();
      const [updated] = await tx
        .update(projects)
        .set({
          category,
          reportSlug,
          reportStaleAfterDays: input.data.staleAfterDays,
          reportPublishedAt: input.data.published
            ? (existing.reportPublishedAt ?? new Date())
            : null,
          reportSections: input.data.sections,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, existing.id))
        .returning();
      const action =
        input.data.published === Boolean(existing.reportPublishedAt)
          ? "report_configured"
          : input.data.published
            ? "report_published"
            : "report_unpublished";
      await tx.insert(reportAuditEvents).values({
        projectId: existing.id,
        action,
        details: { sections: input.data.sections },
      });
      return [updated];
    });
    return context.json({
      project,
      publicPath: `/reports/${slugify(project!.category!)}/${reportSlug}`,
    });
  });

  api.get("/projects/:projectId/public-report/preview", async (context) => {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, context.req.param("projectId")),
    });
    if (!project) return context.json({ error: "Project not found" }, 404);
    const category = project.category ?? "uncategorized";
    const reportSlug =
      project.reportSlug ?? `${slugify(project.name)}-ai-visibility`;
    const report = await loadPublicReport({ ...project, category, reportSlug });
    return context.json({
      html: renderPublicReportHtml(
        report,
        new URL(context.req.url).origin,
        true,
      ),
    });
  });

  api.post(
    "/projects/:projectId/competitors",
    zValidator("json", competitorInput),
    async (context) => {
      const value = context.req.valid("json");
      const [competitor] = await db
        .insert(competitors)
        .values({
          projectId: context.req.param("projectId"),
          name: value.name,
          website: value.website ?? null,
          aliases: value.aliases,
          domains: value.domains,
        })
        .returning();
      return context.json({ competitor }, 201);
    },
  );

  api.get("/projects/:projectId/competitor-suggestions", async (context) => {
    const projectId = competitorProjectIdInput.safeParse(
      context.req.param("projectId"),
    );
    if (!projectId.success)
      return context.json({ error: "Invalid project ID" }, 400);
    const parsed = competitorDiscoverySettingsInput.safeParse({
      range: context.req.query("range") ?? "90d",
      minimumMentions: context.req.query("minimumMentions") ?? 2,
    });
    if (!parsed.success)
      return context.json(
        { error: "Range or minimum-mentions setting is invalid" },
        400,
      );
    const result = await competitorDiscovery(
      projectId.data,
      parsed.data.range,
      parsed.data.minimumMentions,
    );
    if (!result) return context.json({ error: "Project not found" }, 404);
    return context.json(result);
  });

  api.post(
    "/projects/:projectId/competitor-suggestions/reanalyze",
    async (context) => {
      const projectId = competitorProjectIdInput.safeParse(
        context.req.param("projectId"),
      );
      if (!projectId.success)
        return context.json({ error: "Invalid project ID" }, 400);
      const body = await context.req.json().catch(() => ({}));
      const parsed = competitorDiscoverySettingsInput.safeParse(body);
      if (!parsed.success)
        return context.json(
          { error: "Range or minimum-mentions setting is invalid" },
          400,
        );
      const result = await competitorDiscovery(
        projectId.data,
        parsed.data.range,
        parsed.data.minimumMentions,
      );
      if (!result) return context.json({ error: "Project not found" }, 404);
      return context.json(result);
    },
  );

  api.post(
    "/projects/:projectId/competitor-suggestions/:key/dismiss",
    zValidator("json", competitorDismissalInput),
    async (context) => {
      const parsedProjectId = competitorProjectIdInput.safeParse(
        context.req.param("projectId"),
      );
      if (!parsedProjectId.success)
        return context.json({ error: "Invalid project ID" }, 400);
      const projectId = parsedProjectId.data;
      const parent = await db.query.projects.findFirst({
        columns: { id: true },
        where: eq(projects.id, projectId),
      });
      if (!parent) return context.json({ error: "Project not found" }, 404);
      const value = context.req.valid("json");
      await db
        .insert(competitorSuggestionDismissals)
        .values({
          projectId,
          normalizedName: context.req.param("key"),
          ...value,
        })
        .onConflictDoUpdate({
          target: [
            competitorSuggestionDismissals.projectId,
            competitorSuggestionDismissals.normalizedName,
          ],
          set: { ...value, dismissedAt: new Date() },
        });
      return context.body(null, 204);
    },
  );

  api.post(
    "/projects/:projectId/competitor-suggestions/approve",
    zValidator("json", competitorApprovalInput),
    async (context) => {
      const parsedProjectId = competitorProjectIdInput.safeParse(
        context.req.param("projectId"),
      );
      if (!parsedProjectId.success)
        return context.json({ error: "Invalid project ID" }, 400);
      const projectId = parsedProjectId.data;
      const parent = await db.query.projects.findFirst({
        columns: { id: true },
        where: eq(projects.id, projectId),
      });
      if (!parent) return context.json({ error: "Project not found" }, 404);
      const approved = await db.transaction(async (transaction) => {
        const rows = [];
        const existing = await transaction
          .select({ name: competitors.name, aliases: competitors.aliases })
          .from(competitors)
          .where(eq(competitors.projectId, projectId));
        const knownKeys = new Set(
          existing.flatMap((item) =>
            [item.name, ...item.aliases].map(normalizeCompetitorKey),
          ),
        );
        for (const suggestion of context.req.valid("json").suggestions) {
          if (
            [suggestion.name, ...suggestion.aliases].some((value) =>
              knownKeys.has(normalizeCompetitorKey(value)),
            )
          )
            continue;
          const [row] = await transaction
            .insert(competitors)
            .values({
              projectId,
              name: suggestion.name,
              aliases: suggestion.aliases,
              domains: [],
            })
            .onConflictDoNothing()
            .returning();
          if (row) rows.push(row);
          if (row) {
            knownKeys.add(normalizeCompetitorKey(row.name));
            for (const alias of row.aliases)
              knownKeys.add(normalizeCompetitorKey(alias));
          }
        }
        return rows;
      });
      return context.json(
        { competitors: approved, expectedAdditionalRuns: 0 },
        201,
      );
    },
  );

  api.delete("/competitors/:competitorId", async (context) => {
    await db
      .delete(competitors)
      .where(eq(competitors.id, context.req.param("competitorId")));
    return context.body(null, 204);
  });

  api.get("/projects/:projectId/prompts", async (context) => {
    return context.json({
      prompts: await listPrompts(context.req.param("projectId")),
    });
  });

  api.post(
    "/projects/:projectId/prompt-suggestions",
    zValidator("json", promptSuggestionContextInput),
    async (context) => {
      const projectId = context.req.param("projectId");
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });
      if (!project) return context.json({ error: "Project not found" }, 404);
      const input = context.req.valid("json");
      const existing = await db
        .select({ value: prompts.value })
        .from(prompts)
        .where(eq(prompts.projectId, projectId));
      const projectCompetitors = await db
        .select({ name: competitors.name })
        .from(competitors)
        .where(eq(competitors.projectId, projectId));
      const suggestionContext = {
        brandName: project.name,
        website: project.website,
        category: input.category,
        subcategories: input.subcategories,
        audiences: input.audiences,
        geography: input.geography,
        language: input.language,
        competitors: input.competitors.length
          ? input.competitors
          : projectCompetitors.map((item) => item.name),
        additionalContext: input.additionalContext,
      };
      const generatedAt = new Date().toISOString();
      try {
        const response = await runOpenRouterChat({
          messages: [
            {
              role: "user",
              content: buildPromptSuggestionInstructions(
                suggestionContext,
                input.count,
              ),
            },
          ],
          system:
            "You create representative buyer questions for AI visibility monitoring. Return only valid JSON.",
          ...(input.model ? { model: input.model } : {}),
          webSearch: true,
        });
        const parsed = parsePromptSuggestionResponse(response.raw, {
          existingPrompts: existing.map((item) => item.value),
          requestedCount: input.count,
        });
        return context.json({
          ...parsed,
          source: "openrouter",
          metadata: {
            generatorVersion: "prompt-suggestions-v1",
            generatedAt,
            model: parsed.model,
            inputContext: suggestionContext,
            generationCostUsd: parsed.costUsd,
          },
        });
      } catch (error) {
        const suggestions = buildFallbackPromptSuggestions(
          suggestionContext,
          input.count,
          existing.map((item) => item.value),
        );
        return context.json({
          suggestions,
          derivedContext: {
            category: input.category,
            subcategories: input.subcategories,
            audiences: input.audiences,
          },
          source: "template",
          warning:
            error instanceof Error
              ? error.message
              : "OpenRouter generation failed",
          metadata: {
            generatorVersion: "prompt-suggestions-template-v1",
            generatedAt,
            model: null,
            inputContext: suggestionContext,
            generationCostUsd: 0,
          },
        });
      }
    },
  );

  api.post(
    "/projects/:projectId/prompt-suggestions/approve",
    zValidator("json", promptSuggestionApprovalInput),
    async (context) => {
      const projectId = context.req.param("projectId");
      const input = context.req.valid("json");
      const existing = await db
        .select({ value: prompts.value })
        .from(prompts)
        .where(eq(prompts.projectId, projectId));
      const accepted = input.suggestions.filter(
        (suggestion, index, all) =>
          !existing.some((row) =>
            promptsAreNearDuplicates(row.value, suggestion.value),
          ) &&
          all.findIndex((row) =>
            promptsAreNearDuplicates(row.value, suggestion.value),
          ) === index,
      );
      const created = await db.transaction(async (transaction) => {
        const rows = [];
        for (const suggestion of accepted) {
          const [prompt] = await transaction
            .insert(prompts)
            .values({
              projectId,
              value: suggestion.value,
              normalizedValue: normalizePrompt(suggestion.value),
              tags: [
                suggestion.intent,
                suggestion.branded ? "branded" : "generic",
              ],
              enabled: true,
              cadenceMinutes: input.cadenceMinutes,
              generationMetadata: input.metadata,
            })
            .onConflictDoNothing({
              target: [prompts.projectId, prompts.normalizedValue],
            })
            .returning();
          if (!prompt) continue;
          await transaction.insert(promptTargets).values(
            input.targets.map((target) => ({
              promptId: prompt.id,
              ...target,
            })),
          );
          rows.push(prompt);
        }
        return rows;
      });
      return context.json(
        {
          prompts: created,
          createdCount: created.length,
          skippedCount: input.suggestions.length - created.length,
        },
        201,
      );
    },
  );

  api.post(
    "/projects/:projectId/prompts",
    zValidator("json", promptInput),
    async (context) => {
      const input = context.req.valid("json");
      const [prompt] = await db.transaction(async (transaction) => {
        const inserted = await transaction
          .insert(prompts)
          .values({
            projectId: context.req.param("projectId"),
            value: input.value,
            normalizedValue: normalizePrompt(input.value),
            tags: input.tags,
            enabled: input.enabled,
            cadenceMinutes: input.cadenceMinutes,
          })
          .returning();
        const created = inserted[0];
        if (!created) throw new Error("Prompt insert returned no row");
        await transaction.insert(promptTargets).values(
          input.targets.map((target) => ({
            promptId: created.id,
            ...target,
          })),
        );
        return inserted;
      });
      return context.json({ prompt }, 201);
    },
  );

  api.patch(
    "/prompts/:promptId",
    zValidator("json", promptUpdateInput),
    async (context) => {
      const promptId = context.req.param("promptId");
      const { targets, ...updates } = context.req.valid("json");
      const [prompt] = await db.transaction(async (transaction) => {
        const updated = await transaction
          .update(prompts)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(prompts.id, promptId))
          .returning();
        if (targets) {
          await transaction
            .delete(promptTargets)
            .where(eq(promptTargets.promptId, promptId));
          await transaction
            .insert(promptTargets)
            .values(targets.map((target) => ({ promptId, ...target })));
        }
        return updated;
      });
      if (!prompt) return context.json({ error: "Prompt not found" }, 404);
      return context.json({ prompt });
    },
  );

  api.delete("/prompts/:promptId", async (context) => {
    const promptId = context.req.param("promptId");
    const existing = await db.query.prompts.findFirst({
      where: eq(prompts.id, promptId),
    });
    if (!existing) return context.json({ error: "Prompt not found" }, 404);
    const affectedProviders = await db
      .selectDistinct({ provider: promptRuns.provider })
      .from(promptRuns)
      .where(
        and(
          eq(promptRuns.promptId, promptId),
          inArray(promptRuns.status, ["succeeded", "failed"]),
        ),
      );
    await db.delete(prompts).where(eq(prompts.id, promptId));
    await Promise.all(
      affectedProviders.map(({ provider }) =>
        refreshReliabilityOpportunity(existing.projectId, provider),
      ),
    );
    return context.body(null, 204);
  });

  api.post("/prompts/:promptId/run", async (context) => {
    const promptId = context.req.param("promptId");
    const prompt = await db.query.prompts.findFirst({
      where: eq(prompts.id, promptId),
    });
    if (!prompt) return context.json({ error: "Prompt not found" }, 404);
    const targets = await db
      .select()
      .from(promptTargets)
      .where(eq(promptTargets.promptId, promptId));
    if (targets.length === 0) {
      return context.json(
        { error: "No provider targets are configured for this prompt" },
        409,
      );
    }
    const queue = await getQueue();
    const batchId = crypto.randomUUID();
    const runIds: string[] = [];
    const jobIds: string[] = [];
    let createdRuns = 0;
    for (const target of targets) {
      const dedupeKey = `manual:${target.id}`;
      const [createdRun] = await db
        .insert(promptRuns)
        .values({
          promptId,
          promptTargetId: target.id,
          provider: target.provider,
          model: target.model,
          status: "pending",
          dedupeKey,
          batchId,
          trigger: "manual",
        })
        .onConflictDoNothing({ target: promptRuns.dedupeKey })
        .returning({ id: promptRuns.id });
      if (!createdRun) {
        const existing = await db.query.promptRuns.findFirst({
          where: eq(promptRuns.dedupeKey, dedupeKey),
        });
        if (existing) runIds.push(existing.id);
        continue;
      }

      createdRuns += 1;
      runIds.push(createdRun.id);
      try {
        const jobId = await queue.send(
          "run-prompt",
          { promptId, runId: createdRun.id, target },
          { retryLimit: 1 },
        );
        if (!jobId) throw new Error("Queue did not accept the run");
        jobIds.push(jobId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db
          .update(promptRuns)
          .set({
            status: "failed",
            error: `Queue dispatch failed: ${message}`,
            completedAt: new Date(),
            dedupeKey: null,
          })
          .where(eq(promptRuns.id, createdRun.id));
        throw error;
      }
    }
    return context.json(
      {
        queued: true,
        alreadyQueued: createdRuns === 0,
        jobId: jobIds[0] ?? runIds[0],
        jobIds,
        runIds,
      },
      202,
    );
  });

  api.get("/projects/:projectId/visibility", async (context) => {
    const projectId = context.req.param("projectId");
    const since = periodStart(context.req.query("period"));
    const projectPrompts = await db
      .select()
      .from(prompts)
      .where(eq(prompts.projectId, projectId))
      .orderBy(desc(prompts.createdAt));
    const runs = projectPrompts.length
      ? await db
          .select()
          .from(promptRuns)
          .where(
            and(
              inArray(
                promptRuns.promptId,
                projectPrompts.map((prompt) => prompt.id),
              ),
              gte(promptRuns.createdAt, since),
            ),
          )
          .orderBy(desc(promptRuns.createdAt))
      : [];
    const projectTargets = projectPrompts.length
      ? await db
          .select()
          .from(promptTargets)
          .where(
            inArray(
              promptTargets.promptId,
              projectPrompts.map((prompt) => prompt.id),
            ),
          )
      : [];
    const ownedRunRows = runs.length
      ? await db
          .selectDistinct({ runId: citations.runId })
          .from(citations)
          .where(
            and(
              inArray(
                citations.runId,
                runs.map((run) => run.id),
              ),
              eq(citations.category, "owned"),
            ),
          )
      : [];
    const ownedRunIds = new Set(ownedRunRows.map((row) => row.runId));
    const rows = projectPrompts.map((prompt) => {
      const promptRunRows = runs.filter((run) => run.promptId === prompt.id);
      const successful = promptRunRows.filter(
        (run) => run.status === "succeeded",
      );
      const providerGroups = new Map<string, typeof promptRunRows>();
      for (const target of projectTargets.filter(
        (target) => target.promptId === prompt.id,
      )) {
        providerGroups.set(`${target.provider}:${target.model}`, []);
      }
      for (const run of promptRunRows) {
        const groupKey = `${run.provider}:${run.model}`;
        providerGroups.set(groupKey, [
          ...(providerGroups.get(groupKey) ?? []),
          run,
        ]);
      }
      const metricRows = promptRunRows.map((run) => ({
        createdAt: run.createdAt,
        brandMentioned: run.brandMentioned,
        brandCited: ownedRunIds.has(run.id),
        competitorsMentioned: run.competitorsMentioned,
        status: run.status,
      }));
      const summary = metricSummary(metricRows, (run) => run.brandMentioned);
      return {
        prompt,
        visibility: summary.rate,
        mentionRate: summary.rate,
        citationRate: citationRate(metricRows),
        runs: successful.length,
        attemptedRuns: summary.attemptedRuns,
        successfulRuns: summary.successfulRuns,
        failedRuns: summary.failedRuns,
        pendingRuns: summary.pendingRuns,
        runningRuns: summary.runningRuns,
        usableCoveragePercentage: summary.usableCoveragePercentage,
        confidence: summary.confidence,
        mentions: successful.filter((run) => run.brandMentioned).length,
        citedRuns: successful.filter((run) => ownedRunIds.has(run.id)).length,
        lastRunAt: promptRunRows[0]?.createdAt ?? null,
        providers: [...providerGroups.entries()].map(
          ([groupKey, providerRuns]) => {
            const providerMetricRows = providerRuns.map((run) => ({
              createdAt: run.createdAt,
              brandMentioned: run.brandMentioned,
              brandCited: ownedRunIds.has(run.id),
              competitorsMentioned: run.competitorsMentioned,
              status: run.status,
            }));
            const providerSummary = metricSummary(
              providerMetricRows,
              (run) => run.brandMentioned,
            );
            const separator = groupKey.indexOf(":");
            return {
              provider: groupKey.slice(0, separator),
              model: groupKey.slice(separator + 1),
              visibility: providerSummary.rate,
              mentionRate: providerSummary.rate,
              citationRate: citationRate(providerMetricRows),
              runs: providerSummary.successfulRuns,
              attemptedRuns: providerSummary.attemptedRuns,
              successfulRuns: providerSummary.successfulRuns,
              failedRuns: providerSummary.failedRuns,
              pendingRuns: providerSummary.pendingRuns,
              runningRuns: providerSummary.runningRuns,
              usableCoveragePercentage:
                providerSummary.usableCoveragePercentage,
            };
          },
        ),
      };
    });
    const allMetricRows = runs.map((run) => ({
      createdAt: run.createdAt,
      brandMentioned: run.brandMentioned,
      brandCited: ownedRunIds.has(run.id),
      competitorsMentioned: run.competitorsMentioned,
      status: run.status,
    }));
    return context.json({
      rows,
      summary: metricSummary(allMetricRows, (run) => run.brandMentioned),
      providerCoverage: providerCoverage(projectTargets, runs),
    });
  });

  api.get("/run-monitor", async (context) => {
    const allRows = await db
      .select({
        run: promptRuns,
        promptValue: prompts.value,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(promptRuns)
      .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
      .innerJoin(projects, eq(prompts.projectId, projects.id))
      .orderBy(desc(promptRuns.createdAt));
    const values = (name: string) => context.req.queries(name) ?? [];
    const statuses = values("status"),
      projectIds = values("projectId"),
      providers = values("provider"),
      batchIds = values("batchId"),
      promptIds = values("promptId");
    const trigger = context.req.query("trigger"),
      from = context.req.query("from"),
      to = context.req.query("to"),
      search = (context.req.query("search") ?? "").trim().toLocaleLowerCase();
    const fromDate = from
      ? new Date(from.includes("T") ? from : `${from}T00:00:00.000Z`)
      : null;
    const toDate = to
      ? new Date(to.includes("T") ? to : `${to}T23:59:59.999Z`)
      : null;
    const filtered = allRows.filter(
      ({ run, promptValue, projectId, projectName }) =>
        (!statuses.length || statuses.includes(run.status)) &&
        (!projectIds.length || projectIds.includes(projectId)) &&
        (!providers.length || providers.includes(run.provider)) &&
        (!batchIds.length ||
          (run.batchId !== null && batchIds.includes(run.batchId))) &&
        (!promptIds.length || promptIds.includes(run.promptId)) &&
        (!trigger || run.trigger === trigger) &&
        (!fromDate || run.createdAt >= fromDate) &&
        (!toDate || run.createdAt <= toDate) &&
        (!search ||
          `${projectName} ${promptValue} ${run.provider} ${run.model} ${run.error ?? ""}`
            .toLocaleLowerCase()
            .includes(search)),
    );
    const page = Math.max(1, Number(context.req.query("page")) || 1),
      pageSize = Math.min(
        100,
        Math.max(1, Number(context.req.query("pageSize")) || 25),
      );
    const counts = {
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const { run } of filtered) counts[run.status] += 1;
    const batches = [
      ...new Set(
        filtered.flatMap(({ run }) => (run.batchId ? [run.batchId] : [])),
      ),
    ].map((batchId) => {
      const rows = filtered.filter(({ run }) => run.batchId === batchId);
      const completed = rows.filter(({ run }) =>
        ["succeeded", "failed", "cancelled"].includes(run.status),
      ).length;
      const succeeded = rows.filter(
        ({ run }) => run.status === "succeeded",
      ).length;
      const attempted = rows.filter(({ run }) =>
        ["succeeded", "failed"].includes(run.status),
      ).length;
      const startedAt = Math.min(
        ...rows.map(({ run }) => run.createdAt.getTime()),
      );
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      return {
        batchId,
        total: rows.length,
        completed,
        succeeded,
        failed: rows.filter(({ run }) => run.status === "failed").length,
        successRate: attempted ? Math.round((succeeded / attempted) * 100) : 0,
        costUsd: rows.reduce((sum, { run }) => sum + (run.costUsd ?? 0), 0),
        elapsedMs,
        estimatedRemainingMs: completed
          ? Math.round((elapsedMs / completed) * (rows.length - completed))
          : null,
      };
    });
    return context.json({
      counts,
      batches,
      total: filtered.length,
      page,
      pageSize,
      runs: filtered
        .slice((page - 1) * pageSize, page * pageSize)
        .map(({ run, ...row }) => ({
          ...runSummary(run, showProviderCosts),
          ...row,
          batchId: run.batchId,
          trigger: run.trigger,
          lastAttemptAt: run.lastAttemptAt,
        })),
    });
  });

  api.post("/run-monitor/cancel", async (context) => {
    const input = z
      .object({ runIds: z.array(z.string().uuid()).min(1).max(100) })
      .safeParse(await context.req.json().catch(() => null));
    if (!input.success)
      return context.json({ error: "Select between 1 and 100 runs" }, 400);
    const rows = await db
      .update(promptRuns)
      .set({
        status: "cancelled",
        error: "Cancelled before execution",
        completedAt: new Date(),
        dedupeKey: null,
      })
      .where(
        and(
          eq(promptRuns.status, "pending"),
          inArray(promptRuns.id, input.data.runIds),
        ),
      )
      .returning({ id: promptRuns.id });
    return context.json({
      cancelled: rows.length,
      runIds: rows.map((row) => row.id),
    });
  });

  api.post("/run-monitor/retry", async (context) => {
    const input = z
      .object({ runIds: z.array(z.string().uuid()).min(1).max(100) })
      .safeParse(await context.req.json().catch(() => null));
    if (!input.success)
      return context.json({ error: "Select between 1 and 100 runs" }, 400);
    const failed = await db
      .select()
      .from(promptRuns)
      .where(
        and(
          eq(promptRuns.status, "failed"),
          inArray(promptRuns.id, input.data.runIds),
        ),
      );
    const queue = await getQueue(),
      batchId = crypto.randomUUID(),
      runIds: string[] = [];
    for (const prior of failed) {
      const [created] = await db
        .insert(promptRuns)
        .values({
          promptId: prior.promptId,
          promptTargetId: prior.promptTargetId,
          provider: prior.provider,
          model: prior.model,
          batchId,
          trigger: "manual",
        })
        .returning({ id: promptRuns.id });
      if (!created) continue;
      const target = prior.promptTargetId
        ? await db.query.promptTargets.findFirst({
            where: eq(promptTargets.id, prior.promptTargetId),
          })
        : null;
      const jobId = await queue.send(
        "run-prompt",
        { promptId: prior.promptId, runId: created.id, target },
        { retryLimit: 1 },
      );
      if (!jobId) throw new Error("Queue did not accept the retry");
      runIds.push(created.id);
    }
    return context.json({ queued: runIds.length, runIds, batchId }, 202);
  });

  api.get("/projects/:projectId/share-of-voice", async (context) => {
    const projectId = context.req.param("projectId");
    const periodResult = aiReferralPeriodInput.safeParse(
      context.req.query("period") ?? "30d",
    );
    if (!periodResult.success) {
      return context.json({ error: "Period must be 7d, 30d, or 90d" }, 400);
    }
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return context.json({ error: "Project not found" }, 404);
    const projectPrompts = await db
      .select({ id: prompts.id, value: prompts.value, tags: prompts.tags })
      .from(prompts)
      .where(eq(prompts.projectId, projectId));
    const projectTargets = projectPrompts.length
      ? await db
          .selectDistinct({
            provider: promptTargets.provider,
            model: promptTargets.model,
          })
          .from(promptTargets)
          .where(
            inArray(
              promptTargets.promptId,
              projectPrompts.map((prompt) => prompt.id),
            ),
          )
          .orderBy(promptTargets.provider, promptTargets.model)
      : [];
    const window = comparisonPeriod(periodResult.data);
    const runs = projectPrompts.length
      ? await db
          .select()
          .from(promptRuns)
          .where(
            and(
              inArray(
                promptRuns.promptId,
                projectPrompts.map((prompt) => prompt.id),
              ),
              gte(promptRuns.createdAt, window.previousStart),
            ),
          )
      : [];
    const projectCitations = runs.length
      ? await db
          .select({
            runId: citations.runId,
            url: citations.url,
            domain: citations.domain,
            title: citations.title,
            category: citations.category,
            competitorName: citations.competitorName,
          })
          .from(citations)
          .where(
            inArray(
              citations.runId,
              runs.map((run) => run.id),
            ),
          )
      : [];
    return context.json(
      buildShareOfVoiceReport({
        brandName: project.name,
        prompts: projectPrompts,
        runs,
        citations: projectCitations,
        surfaces: projectTargets,
        ...window,
      }),
    );
  });

  api.get("/projects/:projectId/dashboard", async (context) => {
    const projectId = context.req.param("projectId");
    const since = periodStart(context.req.query("period"));
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return context.json({ error: "Project not found" }, 404);
    const projectPrompts = await db
      .select({
        id: prompts.id,
        value: prompts.value,
        enabled: prompts.enabled,
      })
      .from(prompts)
      .where(eq(prompts.projectId, projectId));
    const [overallCost] =
      showProviderCosts && projectPrompts.length
        ? await db
            .select({
              totalUsd: drizzleSql<number>`coalesce(sum(${promptRuns.costUsd}), 0)::double precision`,
              costedRuns: drizzleSql<number>`count(${promptRuns.costUsd})::integer`,
            })
            .from(promptRuns)
            .where(
              inArray(
                promptRuns.promptId,
                projectPrompts.map((prompt) => prompt.id),
              ),
            )
        : [];
    const runs = projectPrompts.length
      ? await db
          .select()
          .from(promptRuns)
          .where(
            and(
              inArray(
                promptRuns.promptId,
                projectPrompts.map((prompt) => prompt.id),
              ),
              gte(promptRuns.createdAt, since),
            ),
          )
          .orderBy(desc(promptRuns.createdAt))
      : [];
    const projectTargets = projectPrompts.length
      ? await db
          .select({
            provider: promptTargets.provider,
            model: promptTargets.model,
          })
          .from(promptTargets)
          .where(
            inArray(
              promptTargets.promptId,
              projectPrompts.map((prompt) => prompt.id),
            ),
          )
      : [];
    const projectCitations = runs.length
      ? await db
          .select()
          .from(citations)
          .where(
            inArray(
              citations.runId,
              runs.map((run) => run.id),
            ),
          )
      : [];
    const ownedRunIds = new Set(
      projectCitations
        .filter((citation) => citation.category === "owned")
        .map((citation) => citation.runId),
    );
    const metricRuns: MetricRun[] = runs.map((run) => ({
      createdAt: run.createdAt,
      brandMentioned: run.brandMentioned,
      brandCited: ownedRunIds.has(run.id),
      competitorsMentioned: run.competitorsMentioned,
      status: run.status,
    }));
    const visibleCosts = runs.filter((run) => run.costUsd !== null);
    const successfulRuns = runs.filter((run) => run.status === "succeeded");
    const promptValues = new Map(
      projectPrompts.map((prompt) => [prompt.id, prompt.value]),
    );
    const mentionSummary = metricSummary(
      metricRuns,
      (run) => run.brandMentioned,
    );
    const {
      rate: _rate,
      confidence: mentionConfidence,
      ...dataTrust
    } = mentionSummary;
    return context.json({
      visibility: mentionSummary.rate,
      mentionRate: mentionSummary.rate,
      citationRate: citationRate(metricRuns),
      trackedPrompts: projectPrompts.length,
      activePrompts: projectPrompts.filter((prompt) => prompt.enabled).length,
      successfulRuns: successfulRuns.length,
      dataTrust,
      mentionConfidence,
      providerCoverage: providerCoverage(projectTargets, runs),
      citedRuns: successfulRuns.filter((run) => ownedRunIds.has(run.id)).length,
      totalCitations: projectCitations.length,
      ownedCitations: projectCitations.filter(
        (citation) => citation.category === "owned",
      ).length,
      trend: visibilityTrend(metricRuns),
      shareOfVoice: shareOfVoice(metricRuns, project.name),
      recentRuns: runs
        .slice(0, 8)
        .map((run) =>
          runSummary(
            { ...run, promptValue: promptValues.get(run.promptId)! },
            showProviderCosts,
          ),
        ),
      ...(showProviderCosts
        ? {
            totalCostUsd: visibleCosts.reduce(
              (total, run) => total + (run.costUsd ?? 0),
              0,
            ),
            costedRuns: visibleCosts.length,
            overallCostUsd: overallCost?.totalUsd ?? 0,
            overallCostedRuns: overallCost?.costedRuns ?? 0,
          }
        : {}),
    });
  });

  api.get("/projects/:projectId/runs", async (context) => {
    const projectId = context.req.param("projectId");
    const promptId = context.req.query("promptId");
    if (promptId && !z.string().uuid().safeParse(promptId).success) {
      return context.json({ error: "Invalid prompt ID" }, 400);
    }
    const rows = await db
      .select({ run: promptRuns, promptValue: prompts.value })
      .from(promptRuns)
      .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
      .where(
        promptId
          ? and(
              eq(prompts.projectId, projectId),
              eq(promptRuns.promptId, promptId),
            )
          : eq(prompts.projectId, projectId),
      )
      .orderBy(desc(promptRuns.createdAt))
      .limit(100);
    return context.json({
      runs: rows.map((row) =>
        runSummary(
          { ...row.run, promptValue: row.promptValue },
          showProviderCosts,
        ),
      ),
    });
  });

  api.get("/runs/:runId", async (context) => {
    const [row] = await db
      .select({ run: promptRuns, promptValue: prompts.value })
      .from(promptRuns)
      .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
      .where(eq(promptRuns.id, context.req.param("runId")))
      .limit(1);
    if (!row) return context.json({ error: "Run not found" }, 404);
    const runCitations = await db
      .select()
      .from(citations)
      .where(eq(citations.runId, row.run.id))
      .orderBy(citations.position);
    return context.json({
      run: {
        ...runDetail(row.run, showProviderCosts),
        promptValue: row.promptValue,
        citations: runCitations,
      },
    });
  });

  api.get("/projects/:projectId/citations", async (context) => {
    const projectId = context.req.param("projectId");
    const rows = await db
      .select({
        citation: citations,
        provider: promptRuns.provider,
        model: promptRuns.model,
        promptValue: prompts.value,
      })
      .from(citations)
      .innerJoin(promptRuns, eq(citations.runId, promptRuns.id))
      .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
      .where(eq(prompts.projectId, projectId))
      .orderBy(desc(citations.createdAt))
      .limit(500);
    // Successful runs per surface, so a surface that contributed no citations
    // is still reported rather than simply missing from the table.
    const runRows = await db
      .select({
        provider: promptRuns.provider,
        model: promptRuns.model,
        successfulRuns: drizzleSql<number>`count(distinct ${promptRuns.id})`,
        citations: drizzleSql<number>`count(${citations.id})`,
      })
      .from(promptRuns)
      .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
      .leftJoin(citations, eq(citations.runId, promptRuns.id))
      .where(
        and(
          eq(prompts.projectId, projectId),
          eq(promptRuns.status, "succeeded"),
        ),
      )
      .groupBy(promptRuns.provider, promptRuns.model);
    return context.json({
      citations: rows.map((row) => ({
        ...row.citation,
        provider: row.provider,
        model: row.model,
        promptValue: row.promptValue,
      })),
      surfaceCoverage: citationSurfaceCoverage(runRows),
    });
  });

  return api;
}

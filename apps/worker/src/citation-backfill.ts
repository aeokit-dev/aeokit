import {
  classifyCitation,
  normalizeDomain,
  resolveCitationUrl,
} from "@aeokit/core";
import {
  citations,
  competitors,
  db,
  projects,
  promptRuns,
  prompts,
} from "@aeokit/db";
import { and, eq, inArray, like } from "drizzle-orm";

export async function repairPostgresGoogleRedirectCitations(
  limit = 100,
): Promise<{ scanned: number; repaired: number; unresolved: number }> {
  const rows = await db
    .select({
      citationId: citations.id,
      url: citations.url,
      projectId: projects.id,
      website: projects.website,
      additionalDomains: projects.additionalDomains,
    })
    .from(citations)
    .innerJoin(promptRuns, eq(promptRuns.id, citations.runId))
    .innerJoin(prompts, eq(prompts.id, promptRuns.promptId))
    .innerJoin(projects, eq(projects.id, prompts.projectId))
    .where(
      and(
        eq(citations.domain, "google.com"),
        like(citations.url, "https://www.google.com/goto?%"),
      ),
    )
    .limit(Math.max(1, Math.min(500, Math.trunc(limit))));
  const projectCompetitors = rows.length
    ? await db
        .select()
        .from(competitors)
        .where(
          inArray(competitors.projectId, [
            ...new Set(rows.map((row) => row.projectId)),
          ]),
        )
    : [];
  let repaired = 0;
  let unresolved = 0;

  for (const row of rows) {
    const resolvedUrl = await resolveCitationUrl(row.url);
    if (resolvedUrl === row.url) {
      unresolved += 1;
      continue;
    }
    const domain = normalizeDomain(resolvedUrl);
    if (!domain) {
      unresolved += 1;
      continue;
    }
    const classification = classifyCitation(
      domain,
      [normalizeDomain(row.website), ...row.additionalDomains],
      projectCompetitors.filter(
        (competitor) => competitor.projectId === row.projectId,
      ),
    );
    await db
      .update(citations)
      .set({
        url: resolvedUrl,
        domain,
        category: classification.category,
        competitorName: classification.competitorName ?? null,
      })
      .where(eq(citations.id, row.citationId));
    repaired += 1;
  }

  return { scanned: rows.length, repaired, unresolved };
}

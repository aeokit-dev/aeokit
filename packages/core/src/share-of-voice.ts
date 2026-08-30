import { metricSummary } from "./metrics";
import {
  compareSurfaces,
  describeSurface,
  surfaceKey,
  uniqueSurfaces,
} from "./surfaces";

export interface ShareOfVoicePromptInput {
  id: string;
  value: string;
  tags: string[];
}

export interface ShareOfVoiceRunInput {
  id: string;
  promptId: string;
  createdAt: Date | string;
  provider: string;
  model: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  brandMentioned: boolean;
  competitorsMentioned: string[];
}

export interface ShareOfVoiceSurfaceInput {
  provider: string;
  model: string;
}

export interface ShareOfVoiceCitationInput {
  runId: string;
  url: string;
  domain: string;
  title: string | null;
  category: "owned" | "competitor" | "social" | "institutional" | "other";
  competitorName: string | null;
}

export interface ShareOfVoiceReport {
  period: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
  };
  overview: {
    share: number;
    /**
     * Null when the comparison window holds no successful runs. A period with
     * nothing measured has an undefined share, not a share of zero, and the
     * difference against it is not a movement.
     */
    previousShare: number | null;
    change: number | null;
    mentions: number;
    totalMentions: number;
    rank: number;
    trackedBrands: number;
    leaderboard: Array<{ name: string; mentions: number; share: number }>;
  };
  trend: Array<{
    date: string;
    share: number;
    mentions: number;
    totalMentions: number;
  }>;
  engines: ShareOfVoiceEngineRow[];
  confidence: {
    successfulRuns: number;
    failedRuns: number;
    pendingRuns: number;
    completionRate: number;
    level: "none" | "low" | "medium" | "high";
  };
  categories: Array<{
    category: string;
    prompts: number;
    successfulRuns: number;
    mentions: number;
    totalMentions: number;
    share: number;
  }>;
  prompts: Array<{
    promptId: string;
    prompt: string;
    category: string;
    successfulRuns: number;
    mentions: number;
    totalMentions: number;
    share: number;
    leader: string;
    gap: number;
  }>;
  citationOwnership: {
    total: number;
    owned: number;
    competitor: number;
    thirdParty: number;
    ownedShare: number;
    ownedPages: Array<{
      url: string;
      domain: string;
      title: string | null;
      citations: number;
    }>;
    externalSources: Array<{
      domain: string;
      category: "competitor" | "social" | "institutional" | "other";
      competitorName: string | null;
      citations: number;
    }>;
  };
  competitorGaps: Array<{
    competitor: string;
    losses: number;
    category: string;
    engine: string;
    engineProvider: string;
    competitorCitations: number;
    thirdPartyCitations: number;
    reason: string;
  }>;
}

export interface ShareOfVoiceEngineRow {
  /** Surface name, e.g. `Bing Copilot`. */
  engine: string;
  provider: string;
  model: string;
  providerLabel: string;
  /**
   * False when runs exist for a surface the brand no longer targets. Always
   * true when the caller did not supply the configured set.
   */
  configured: boolean;
  successfulRuns: number;
  failedRuns: number;
  mentions: number;
  totalMentions: number;
  share: number;
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function dateValue(value: Date | string): number {
  return new Date(value).getTime();
}

function mentionsForRuns(
  runs: ShareOfVoiceRunInput[],
  brandName: string,
): Map<string, number> {
  const mentions = new Map<string, number>([[brandName, 0]]);
  for (const run of runs) {
    if (run.status !== "succeeded") continue;
    if (run.brandMentioned) {
      mentions.set(brandName, (mentions.get(brandName) ?? 0) + 1);
    }
    for (const competitor of new Set(run.competitorsMentioned)) {
      mentions.set(competitor, (mentions.get(competitor) ?? 0) + 1);
    }
  }
  return mentions;
}

function leaderboardForRuns(
  runs: ShareOfVoiceRunInput[],
  brandName: string,
): Array<{ name: string; mentions: number; share: number }> {
  const mentions = mentionsForRuns(runs, brandName);
  const total = [...mentions.values()].reduce((sum, count) => sum + count, 0);
  return [...mentions.entries()]
    .map(([name, count]) => ({
      name,
      mentions: count,
      share: percent(count, total),
    }))
    .sort(
      (left, right) =>
        right.mentions - left.mentions || left.name.localeCompare(right.name),
    );
}

function primaryCategory(prompt: ShareOfVoicePromptInput | undefined): string {
  return prompt?.tags.find((tag) => tag.trim())?.trim() || "Uncategorized";
}

function mostFrequent<T extends string>(values: T[], fallback: T): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return (
    [...counts.entries()].sort(
      ([leftValue, leftCount], [rightValue, rightCount]) =>
        rightCount - leftCount || leftValue.localeCompare(rightValue),
    )[0]?.[0] ?? fallback
  );
}

export function buildShareOfVoiceReport({
  brandName,
  prompts,
  runs,
  citations,
  surfaces = [],
  currentStart,
  currentEnd,
  previousStart,
}: {
  brandName: string;
  prompts: ShareOfVoicePromptInput[];
  runs: ShareOfVoiceRunInput[];
  citations: ShareOfVoiceCitationInput[];
  /**
   * The provider targets the brand actually tracks. Omit only when the
   * configured set is unknown — rows are then derived from observed runs and
   * every surface is reported as configured, rather than as deconfigured.
   */
  surfaces?: ShareOfVoiceSurfaceInput[];
  currentStart: Date | string;
  currentEnd: Date | string;
  previousStart: Date | string;
}): ShareOfVoiceReport {
  const currentStartTime = dateValue(currentStart);
  const currentEndTime = dateValue(currentEnd);
  const previousStartTime = dateValue(previousStart);
  const currentRuns = runs.filter((run) => {
    const createdAt = dateValue(run.createdAt);
    return createdAt >= currentStartTime && createdAt < currentEndTime;
  });
  const previousRuns = runs.filter((run) => {
    const createdAt = dateValue(run.createdAt);
    return createdAt >= previousStartTime && createdAt < currentStartTime;
  });
  const successfulRuns = currentRuns.filter(
    (run) => run.status === "succeeded",
  );
  const failedRuns = currentRuns.filter((run) => run.status === "failed");
  const leaderboard = leaderboardForRuns(currentRuns, brandName);
  const previousLeaderboard = leaderboardForRuns(previousRuns, brandName);
  const previousMeasured = previousRuns.some(
    (run) => run.status === "succeeded",
  );
  const brandRow = leaderboard.find((row) => row.name === brandName)!;
  const previousBrandRow = previousLeaderboard.find(
    (row) => row.name === brandName,
  )!;
  const totalMentions = leaderboard.reduce(
    (sum, item) => sum + item.mentions,
    0,
  );

  const trendGroups = new Map<string, ShareOfVoiceRunInput[]>();
  for (const run of successfulRuns) {
    const date = new Date(run.createdAt).toISOString().slice(0, 10);
    trendGroups.set(date, [...(trendGroups.get(date) ?? []), run]);
  }
  const trend = [...trendGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dayRuns]) => {
      const dayLeaderboard = leaderboardForRuns(dayRuns, brandName);
      const dayBrand = dayLeaderboard.find((row) => row.name === brandName)!;
      return {
        date,
        share: dayBrand.share,
        mentions: dayBrand.mentions,
        totalMentions: dayLeaderboard.reduce(
          (sum, row) => sum + row.mentions,
          0,
        ),
      };
    });

  const configuredSurfaces = uniqueSurfaces(surfaces).sort(compareSurfaces);
  const configuredKeys = new Set(
    configuredSurfaces.map((surface) => surface.key),
  );
  // Configured surfaces first, then any surface that produced runs but is no
  // longer targeted, so every measurement stays attributable to a provider.
  const orphanedSurfaces = uniqueSurfaces(currentRuns)
    .filter((surface) => !configuredKeys.has(surface.key))
    .sort(compareSurfaces);
  const engineSurfaces = [...configuredSurfaces, ...orphanedSurfaces];
  const engines = engineSurfaces.map((surface) => {
    const engineRuns = currentRuns.filter(
      (run) => surfaceKey(run.provider, run.model) === surface.key,
    );
    const engineLeaderboard = leaderboardForRuns(engineRuns, brandName);
    const engineBrand = engineLeaderboard.find(
      (row) => row.name === brandName,
    )!;
    return {
      engine: surface.label,
      provider: surface.provider,
      model: surface.model,
      providerLabel: surface.providerLabel,
      configured: configuredKeys.size === 0 || configuredKeys.has(surface.key),
      successfulRuns: engineRuns.filter((run) => run.status === "succeeded")
        .length,
      failedRuns: engineRuns.filter((run) => run.status === "failed").length,
      mentions: engineBrand.mentions,
      totalMentions: engineLeaderboard.reduce(
        (sum, row) => sum + row.mentions,
        0,
      ),
      share: engineBrand.share,
    };
  });

  const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const promptRows = prompts.map((prompt) => {
    const promptRuns = currentRuns.filter((run) => run.promptId === prompt.id);
    const promptLeaderboard = leaderboardForRuns(promptRuns, brandName);
    const promptBrand = promptLeaderboard.find(
      (row) => row.name === brandName,
    )!;
    const leader = promptLeaderboard[0] ?? promptBrand;
    return {
      promptId: prompt.id,
      prompt: prompt.value,
      category: primaryCategory(prompt),
      successfulRuns: promptRuns.filter((run) => run.status === "succeeded")
        .length,
      mentions: promptBrand.mentions,
      totalMentions: promptLeaderboard.reduce(
        (sum, row) => sum + row.mentions,
        0,
      ),
      share: promptBrand.share,
      leader: leader.name,
      gap: Math.max(0, leader.share - promptBrand.share),
    };
  });
  const categoryNames = [...new Set(promptRows.map((row) => row.category))];
  const categories = categoryNames
    .map((category) => {
      const categoryPromptIds = new Set(
        promptRows
          .filter((row) => row.category === category)
          .map((row) => row.promptId),
      );
      const categoryRuns = currentRuns.filter((run) =>
        categoryPromptIds.has(run.promptId),
      );
      const categoryLeaderboard = leaderboardForRuns(categoryRuns, brandName);
      const categoryBrand = categoryLeaderboard.find(
        (row) => row.name === brandName,
      )!;
      return {
        category,
        prompts: categoryPromptIds.size,
        successfulRuns: categoryRuns.filter((run) => run.status === "succeeded")
          .length,
        mentions: categoryBrand.mentions,
        totalMentions: categoryLeaderboard.reduce(
          (sum, row) => sum + row.mentions,
          0,
        ),
        share: categoryBrand.share,
      };
    })
    .sort(
      (left, right) =>
        right.share - left.share || left.category.localeCompare(right.category),
    );

  const currentRunIds = new Set(currentRuns.map((run) => run.id));
  const currentCitations = citations.filter((citation) =>
    currentRunIds.has(citation.runId),
  );
  const ownedCitations = currentCitations.filter(
    (citation) => citation.category === "owned",
  );
  const competitorCitations = currentCitations.filter(
    (citation) => citation.category === "competitor",
  );
  const thirdPartyCitations = currentCitations.filter(
    (citation) =>
      citation.category === "social" ||
      citation.category === "institutional" ||
      citation.category === "other",
  );
  const ownedPageGroups = new Map<
    string,
    ShareOfVoiceReport["citationOwnership"]["ownedPages"][number]
  >();
  for (const citation of ownedCitations) {
    const existing = ownedPageGroups.get(citation.url);
    ownedPageGroups.set(citation.url, {
      url: citation.url,
      domain: citation.domain,
      title: citation.title,
      citations: (existing?.citations ?? 0) + 1,
    });
  }
  const externalGroups = new Map<
    string,
    ShareOfVoiceReport["citationOwnership"]["externalSources"][number]
  >();
  for (const citation of [...competitorCitations, ...thirdPartyCitations]) {
    const category = citation.category as Exclude<
      ShareOfVoiceCitationInput["category"],
      "owned"
    >;
    const key = `${citation.domain}:${category}:${citation.competitorName ?? ""}`;
    const existing = externalGroups.get(key);
    externalGroups.set(key, {
      domain: citation.domain,
      category,
      competitorName: citation.competitorName,
      citations: (existing?.citations ?? 0) + 1,
    });
  }

  const lostRuns = successfulRuns.filter(
    (run) => !run.brandMentioned && run.competitorsMentioned.length > 0,
  );
  const lostCompetitors = [
    ...new Set(lostRuns.flatMap((run) => run.competitorsMentioned)),
  ];
  const competitorGaps = lostCompetitors
    .map((competitor) => {
      const competitorRuns = lostRuns.filter((run) =>
        run.competitorsMentioned.includes(competitor),
      );
      const competitorRunIds = new Set(competitorRuns.map((run) => run.id));
      const gapCitations = currentCitations.filter((citation) =>
        competitorRunIds.has(citation.runId),
      );
      const directCitations = gapCitations.filter(
        (citation) =>
          citation.category === "competitor" &&
          (!citation.competitorName ||
            citation.competitorName.toLowerCase() === competitor.toLowerCase()),
      ).length;
      const thirdParty = gapCitations.filter(
        (citation) =>
          citation.category === "social" ||
          citation.category === "institutional" ||
          citation.category === "other",
      ).length;
      const category = mostFrequent(
        competitorRuns.map((run) =>
          primaryCategory(promptMap.get(run.promptId)),
        ),
        "Uncategorized",
      );
      // Group by surface identity, not by label: two providers can serve the
      // same surface name, and the row has to stay attributable to one target.
      const engineKey = mostFrequent(
        competitorRuns.map((run) => surfaceKey(run.provider, run.model)),
        "",
      );
      const engineRun = competitorRuns.find(
        (run) => surfaceKey(run.provider, run.model) === engineKey,
      );
      const engineSurface = engineRun
        ? describeSurface(engineRun.provider, engineRun.model)
        : undefined;
      const engine = engineSurface?.label ?? "Unknown surface";
      const engineProvider = engineSurface?.providerLabel ?? "Unknown provider";
      const evidence = [
        directCitations > 0
          ? `${directCitations} competitor citation${directCitations === 1 ? "" : "s"}`
          : null,
        thirdParty > 0
          ? `${thirdParty} third-party citation${thirdParty === 1 ? "" : "s"}`
          : null,
      ].filter((item): item is string => Boolean(item));
      return {
        competitor,
        losses: competitorRuns.length,
        category,
        engine,
        engineProvider,
        competitorCitations: directCitations,
        thirdPartyCitations: thirdParty,
        reason: `${competitor} appeared while ${brandName} did not in ${competitorRuns.length} ${category} run${competitorRuns.length === 1 ? "" : "s"} on ${engine} via ${engineProvider}${evidence.length ? `, supported by ${evidence.join(" and ")}` : ""}.`,
      };
    })
    .sort(
      (left, right) =>
        right.losses - left.losses ||
        right.competitorCitations - left.competitorCitations ||
        left.competitor.localeCompare(right.competitor),
    );

  const confidence = metricSummary(currentRuns, (run) => run.brandMentioned);
  const ownedShare = percent(ownedCitations.length, currentCitations.length);

  return {
    period: {
      currentStart: new Date(currentStartTime).toISOString(),
      currentEnd: new Date(currentEndTime).toISOString(),
      previousStart: new Date(previousStartTime).toISOString(),
    },
    overview: {
      share: brandRow.share,
      previousShare: previousMeasured ? previousBrandRow.share : null,
      change: previousMeasured ? brandRow.share - previousBrandRow.share : null,
      mentions: brandRow.mentions,
      totalMentions,
      rank: Math.max(
        1,
        leaderboard.findIndex((row) => row.name === brandName) + 1,
      ),
      trackedBrands: leaderboard.length,
      leaderboard,
    },
    trend,
    engines,
    confidence: {
      successfulRuns: successfulRuns.length,
      failedRuns: failedRuns.length,
      pendingRuns: confidence.pendingRuns + confidence.runningRuns,
      completionRate: confidence.usableCoveragePercentage,
      level: confidence.confidence.level,
    },
    categories,
    prompts: promptRows,
    citationOwnership: {
      total: currentCitations.length,
      owned: ownedCitations.length,
      competitor: competitorCitations.length,
      thirdParty: thirdPartyCitations.length,
      ownedShare,
      ownedPages: [...ownedPageGroups.values()].sort(
        (left, right) =>
          right.citations - left.citations || left.url.localeCompare(right.url),
      ),
      externalSources: [...externalGroups.values()].sort(
        (left, right) =>
          right.citations - left.citations ||
          left.domain.localeCompare(right.domain),
      ),
    },
    competitorGaps,
  };
}

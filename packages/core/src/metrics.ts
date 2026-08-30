export interface MetricRun {
  createdAt: Date | string;
  brandMentioned: boolean;
  brandCited?: boolean;
  competitorsMentioned: string[];
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
}

export interface VisibilityPoint {
  date: string;
  visibility: number | null;
  runs: number;
  attemptedRuns: number;
  failedRuns: number;
  coverage: number;
}

export type ConfidenceLevel = "none" | "low" | "medium" | "high";

export interface MetricSummary {
  rate: number | null;
  attemptedRuns: number;
  successfulRuns: number;
  failedRuns: number;
  pendingRuns: number;
  runningRuns: number;
  usableCoveragePercentage: number;
  confidence: {
    level: ConfidenceLevel;
    sampleSize: number;
    interval: { low: number; high: number } | null;
  };
}

export interface ProviderCoverage {
  coveredSurfaces: number;
  totalSurfaces: number;
  percentage: number | null;
}

export function providerCoverage(
  targets: Array<{ provider: string; model: string }>,
  runs: Array<{
    provider: string;
    model: string;
    status: MetricRun["status"];
  }>,
): ProviderCoverage {
  const targetKeys = new Set(
    targets.map((target) => `${target.provider}:${target.model}`),
  );
  const coveredKeys = new Set(
    runs
      .filter((run) => run.status === "succeeded")
      .map((run) => `${run.provider}:${run.model}`)
      .filter((key) => targetKeys.has(key)),
  );
  return {
    coveredSurfaces: coveredKeys.size,
    totalSurfaces: targetKeys.size,
    percentage:
      targetKeys.size === 0
        ? null
        : roundedPercentage(coveredKeys.size, targetKeys.size),
  };
}

function roundedPercentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function wilsonInterval(
  positive: number,
  sampleSize: number,
): { low: number; high: number } | null {
  if (sampleSize <= 0) return null;
  const proportion = positive / sampleSize;
  const z = 1.96;
  const zSquared = z * z;
  const denominator = 1 + zSquared / sampleSize;
  const center = (proportion + zSquared / (2 * sampleSize)) / denominator;
  const margin =
    (z *
      Math.sqrt(
        (proportion * (1 - proportion)) / sampleSize +
          zSquared / (4 * sampleSize * sampleSize),
      )) /
    denominator;
  return {
    low: Math.round(Math.max(0, center - margin) * 100),
    high: Math.round(Math.min(1, center + margin) * 100),
  };
}

export function metricSummary(
  runs: MetricRun[],
  predicate: (run: MetricRun) => boolean,
): MetricSummary {
  const attempted = runs.filter(
    (run) => run.status === "succeeded" || run.status === "failed",
  );
  const successful = runs.filter((run) => run.status === "succeeded");
  const positive = successful.filter(predicate).length;
  const usableCoveragePercentage = roundedPercentage(
    successful.length,
    attempted.length,
  );
  const level: ConfidenceLevel =
    successful.length === 0
      ? "none"
      : successful.length < 30 || usableCoveragePercentage < 80
        ? "low"
        : successful.length < 100 || usableCoveragePercentage < 95
          ? "medium"
          : "high";
  return {
    rate:
      successful.length === 0
        ? null
        : roundedPercentage(positive, successful.length),
    attemptedRuns: attempted.length,
    successfulRuns: successful.length,
    failedRuns: runs.filter((run) => run.status === "failed").length,
    pendingRuns: runs.filter((run) => run.status === "pending").length,
    runningRuns: runs.filter((run) => run.status === "running").length,
    usableCoveragePercentage,
    confidence: {
      level,
      sampleSize: successful.length,
      interval: wilsonInterval(positive, successful.length),
    },
  };
}

function successfulRate(
  runs: MetricRun[],
  predicate: (run: MetricRun) => boolean,
): number | null {
  return metricSummary(runs, predicate).rate;
}

export function mentionRate(runs: MetricRun[]): number | null {
  return successfulRate(runs, (run) => run.brandMentioned);
}

export function citationRate(runs: MetricRun[]): number | null {
  return successfulRate(runs, (run) => run.brandCited === true);
}

// Kept for API compatibility. Visibility historically meant brand mentions.
export function visibilityScore(runs: MetricRun[]): number | null {
  return mentionRate(runs);
}

export function shareOfVoice(
  runs: MetricRun[],
  brandName: string,
): Array<{ name: string; mentions: number; share: number }> {
  const mentions = new Map<string, number>();
  mentions.set(brandName, 0);

  for (const run of runs.filter((item) => item.status === "succeeded")) {
    if (run.brandMentioned) {
      mentions.set(brandName, (mentions.get(brandName) ?? 0) + 1);
    }
    for (const competitor of new Set(run.competitorsMentioned)) {
      mentions.set(competitor, (mentions.get(competitor) ?? 0) + 1);
    }
  }

  const total = [...mentions.values()].reduce((sum, value) => sum + value, 0);
  return [...mentions.entries()]
    .map(([name, count]) => ({
      name,
      mentions: count,
      share: total === 0 ? 0 : Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.mentions - a.mentions);
}

export function visibilityTrend(runs: MetricRun[]): VisibilityPoint[] {
  const days = new Map<string, MetricRun[]>();
  for (const run of runs) {
    const date = new Date(run.createdAt).toISOString().slice(0, 10);
    days.set(date, [...(days.get(date) ?? []), run]);
  }
  return [...days.entries()]
    .filter(([, dayRuns]) =>
      dayRuns.some(
        (run) => run.status === "succeeded" || run.status === "failed",
      ),
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRuns]) => ({
      date,
      visibility: visibilityScore(dayRuns),
      runs: dayRuns.filter((run) => run.status === "succeeded").length,
      attemptedRuns: dayRuns.filter(
        (run) => run.status === "succeeded" || run.status === "failed",
      ).length,
      failedRuns: dayRuns.filter((run) => run.status === "failed").length,
      coverage: metricSummary(dayRuns, (run) => run.brandMentioned)
        .usableCoveragePercentage,
    }));
}

import { describe, expect, it } from "vitest";
import {
  citationRate,
  metricSummary,
  mentionRate,
  shareOfVoice,
  visibilityScore,
  visibilityTrend,
} from "./metrics.js";

const runs = [
  {
    createdAt: "2026-08-24T12:00:00Z",
    brandMentioned: true,
    brandCited: false,
    competitorsMentioned: ["Acme"],
    status: "succeeded" as const,
  },
  {
    createdAt: "2026-08-24T15:00:00Z",
    brandMentioned: false,
    brandCited: true,
    competitorsMentioned: ["Acme"],
    status: "succeeded" as const,
  },
  {
    createdAt: "2026-08-25T12:00:00Z",
    brandMentioned: true,
    brandCited: false,
    competitorsMentioned: [],
    status: "succeeded" as const,
  },
];

describe("metrics", () => {
  it("calculates visibility", () => expect(visibilityScore(runs)).toBe(67));
  it("separates mention and citation rates", () => {
    expect(mentionRate(runs)).toBe(67);
    expect(citationRate(runs)).toBe(33);
  });
  it("calculates share of voice", () => {
    expect(shareOfVoice(runs, "aeokit")).toEqual([
      { name: "aeokit", mentions: 2, share: 50 },
      { name: "Acme", mentions: 2, share: 50 },
    ]);
  });
  it("builds a daily trend", () => {
    expect(visibilityTrend(runs)).toEqual([
      {
        date: "2026-08-24",
        visibility: 50,
        runs: 2,
        attemptedRuns: 2,
        failedRuns: 0,
        coverage: 100,
      },
      {
        date: "2026-08-25",
        visibility: 100,
        runs: 1,
        attemptedRuns: 1,
        failedRuns: 0,
        coverage: 100,
      },
    ]);
  });

  it("reports the observed 28-run trust failure without treating failures as non-mentions", () => {
    const observedRuns = Array.from({ length: 28 }, (_, index) => ({
      createdAt: "2026-08-26T12:00:00Z",
      brandMentioned: index < 9,
      brandCited: false,
      competitorsMentioned: [],
      status: (index < 11 ? "succeeded" : "failed") as "succeeded" | "failed",
    }));

    expect(metricSummary(observedRuns, (run) => run.brandMentioned)).toEqual({
      rate: 82,
      attemptedRuns: 28,
      successfulRuns: 11,
      failedRuns: 17,
      pendingRuns: 0,
      runningRuns: 0,
      usableCoveragePercentage: 39,
      confidence: {
        level: "low",
        sampleSize: 11,
        interval: { low: 52, high: 95 },
      },
    });
  });

  it("uses Unknown for a day with failures but no successful evidence", () => {
    const failedRun = {
      createdAt: "2026-08-26T12:00:00Z",
      brandMentioned: false,
      brandCited: false,
      competitorsMentioned: [],
      status: "failed" as const,
    };

    expect(mentionRate([failedRun])).toBeNull();
    expect(visibilityTrend([failedRun])).toEqual([
      {
        date: "2026-08-26",
        visibility: null,
        runs: 0,
        attemptedRuns: 1,
        failedRuns: 1,
        coverage: 0,
      },
    ]);
  });

  it("excludes a pre-provider cancellation from attempted-run reliability", () => {
    const observedRuns = [
      ...runs,
      {
        createdAt: "2026-08-25T12:30:00Z",
        brandMentioned: false,
        brandCited: false,
        competitorsMentioned: [],
        status: "cancelled" as const,
      },
    ];

    expect(metricSummary(observedRuns, (run) => run.brandMentioned)).toEqual({
      rate: 67,
      attemptedRuns: 3,
      successfulRuns: 3,
      failedRuns: 0,
      pendingRuns: 0,
      runningRuns: 0,
      usableCoveragePercentage: 100,
      confidence: {
        level: "low",
        sampleSize: 3,
        interval: { low: 21, high: 94 },
      },
    });
  });
});

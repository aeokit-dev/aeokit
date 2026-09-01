import type { CompetitorSuggestion } from "./types";

export interface CompetitorChangeSummary {
  newlyDiscovered: string[];
  removed: string[];
  confidenceChanged: Array<{
    name: string;
    from: number;
    to: number;
  }>;
}

export function summarizeCompetitorChanges(
  previous: CompetitorSuggestion[],
  current: CompetitorSuggestion[],
): CompetitorChangeSummary {
  const before = new Map(previous.map((item) => [item.key, item]));
  const after = new Map(current.map((item) => [item.key, item]));
  return {
    newlyDiscovered: current
      .filter((item) => !before.has(item.key))
      .map((item) => item.name),
    removed: previous
      .filter((item) => !after.has(item.key))
      .map((item) => item.name),
    confidenceChanged: current.flatMap((item) => {
      const prior = before.get(item.key);
      return prior && prior.confidenceScore !== item.confidenceScore
        ? [
            {
              name: item.name,
              from: prior.confidenceScore,
              to: item.confidenceScore,
            },
          ]
        : [];
    }),
  };
}

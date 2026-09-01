import { describe, expect, it } from "vitest";
import { summarizeCompetitorChanges } from "./competitor-discovery";
import type { CompetitorSuggestion } from "./types";

function suggestion(
  key: string,
  confidenceScore: number,
): CompetitorSuggestion {
  return {
    key,
    name: key[0]!.toUpperCase() + key.slice(1),
    aliases: [],
    mentionCount: 2,
    mentionPercentage: 50,
    promptCount: 2,
    providerCount: 1,
    confidenceScore,
    confidence: "medium",
    evidence: [],
  };
}

describe("historical competitor reanalysis", () => {
  it("previews newly discovered, removed, and confidence-changed brands", () => {
    expect(
      summarizeCompetitorChanges(
        [suggestion("oldbrand", 60), suggestion("steady", 55)],
        [suggestion("newbrand", 70), suggestion("steady", 75)],
      ),
    ).toEqual({
      newlyDiscovered: ["Newbrand"],
      removed: ["Oldbrand"],
      confidenceChanged: [{ name: "Steady", from: 55, to: 75 }],
    });
  });
});

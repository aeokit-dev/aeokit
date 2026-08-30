import { describe, expect, it } from "vitest";
import {
  buildFallbackPromptSuggestions,
  parsePromptSuggestionResponse,
} from "./prompt-suggestions";

const context = {
  brandName: "Acme",
  website: "https://acme.example",
  category: "project management software",
  subcategories: ["resource planning"],
  audiences: ["software agencies"],
  geography: "United States",
  language: "English",
  competitors: ["Globex"],
  additionalContext: "Used by distributed teams",
};

describe("parsePromptSuggestionResponse", () => {
  it("parses the observed OpenRouter response wrapper and removes existing and near-duplicate prompts", () => {
    const response = {
      id: "gen-123",
      model: "openai/gpt-4.1-mini",
      usage: { cost: "0.0042" },
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({
              category: "Project management software",
              subcategories: ["Resource planning"],
              audiences: ["Software agencies"],
              suggestions: [
                {
                  value:
                    "What are the best project management tools for agencies?",
                  intent: "category_discovery",
                  branded: false,
                },
                {
                  value: "what are best project-management tools for an agency",
                  intent: "category_discovery",
                  branded: false,
                },
                {
                  value: "Is Acme or Globex better for resource planning?",
                  intent: "comparison",
                  branded: true,
                },
              ],
            }),
          },
        },
      ],
    };

    const result = parsePromptSuggestionResponse(response, {
      existingPrompts: [
        "What are the best project management tools for agencies",
      ],
      requestedCount: 10,
    });

    expect(result).toMatchObject({
      model: "openai/gpt-4.1-mini",
      costUsd: 0.0042,
      derivedContext: {
        category: "Project management software",
      },
    });
    expect(result.suggestions).toEqual([
      {
        value: "Is Acme or Globex better for resource planning?",
        intent: "comparison",
        branded: true,
      },
    ]);
  });

  it("rejects prose and invalid intent values instead of accepting unstructured output", () => {
    expect(() =>
      parsePromptSuggestionResponse(
        { choices: [{ message: { content: "Here are some ideas..." } }] },
        { existingPrompts: [], requestedCount: 10 },
      ),
    ).toThrow(/structured prompt suggestions/i);
  });
});

describe("buildFallbackPromptSuggestions", () => {
  it("is deterministic, balanced, and excludes existing near-duplicates", () => {
    const first = buildFallbackPromptSuggestions(context, 12, [
      "What are the best project management software options for software agencies?",
    ]);
    const second = buildFallbackPromptSuggestions(context, 12, [
      "What are the best project management software options for software agencies?",
    ]);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(7);
    expect(
      new Set(first.map((item) => item.intent)).size,
    ).toBeGreaterThanOrEqual(6);
    expect(first.some((item) => item.branded)).toBe(true);
    expect(first.some((item) => !item.branded)).toBe(true);
    expect(
      first.some((item) =>
        item.value.includes("best project management software options"),
      ),
    ).toBe(false);
  });
});

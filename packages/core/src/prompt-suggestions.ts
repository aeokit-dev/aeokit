export const promptIntents = [
  "category_discovery",
  "use_case",
  "audience_industry",
  "comparison",
  "alternatives",
  "evaluation",
  "transactional",
] as const;

export type PromptIntent = (typeof promptIntents)[number];

export interface PromptSuggestionContext {
  brandName: string;
  website: string;
  category: string;
  subcategories: string[];
  audiences: string[];
  geography: string;
  language: string;
  competitors: string[];
  additionalContext: string;
}

export interface PromptSuggestion {
  value: string;
  intent: PromptIntent;
  branded: boolean;
}

export interface PromptSuggestionResult {
  suggestions: PromptSuggestion[];
  derivedContext: Pick<
    PromptSuggestionContext,
    "category" | "subcategories" | "audiences"
  >;
  model: string;
  costUsd: number | null;
}

const intentSet = new Set<string>(promptIntents);

export function normalizePrompt(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(an?|the|for|to|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return new Set(normalizePrompt(value).split(" ").filter(Boolean));
}

export function promptsAreNearDuplicates(left: string, right: string): boolean {
  const a = normalizePrompt(left);
  const b = normalizePrompt(right);
  if (a === b) return true;
  const aTokens = tokens(a);
  const bTokens = tokens(b);
  if (!aTokens.size || !bTokens.size) return false;
  const intersection = [...aTokens].filter((token) =>
    bTokens.has(token),
  ).length;
  return intersection / Math.min(aTokens.size, bTokens.size) >= 0.8;
}

export function dedupePromptSuggestions(
  suggestions: PromptSuggestion[],
  existingPrompts: string[],
  limit = 30,
) {
  const accepted: PromptSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (
      [...existingPrompts, ...accepted.map((item) => item.value)].some(
        (value) => promptsAreNearDuplicates(value, suggestion.value),
      )
    )
      continue;
    accepted.push(suggestion);
    if (accepted.length === limit) break;
  }
  return accepted;
}

function parseCost(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePromptSuggestionResponse(
  response: unknown,
  options: { existingPrompts: string[]; requestedCount: number },
): PromptSuggestionResult {
  try {
    const wrapper = response as {
      model?: unknown;
      usage?: { cost?: unknown };
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = wrapper.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("missing content");
    const fenced =
      content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
    const parsed = JSON.parse(fenced.trim()) as Record<string, unknown>;
    if (!Array.isArray(parsed.suggestions))
      throw new Error("missing suggestions");
    const suggestions = parsed.suggestions.map((item) => {
      const row = item as Record<string, unknown>;
      if (
        typeof row.value !== "string" ||
        row.value.trim().length < 5 ||
        typeof row.intent !== "string" ||
        !intentSet.has(row.intent) ||
        typeof row.branded !== "boolean"
      )
        throw new Error("invalid suggestion");
      return {
        value: row.value.trim(),
        intent: row.intent as PromptIntent,
        branded: row.branded,
      };
    });
    const strings = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    return {
      suggestions: dedupePromptSuggestions(
        suggestions,
        options.existingPrompts,
        options.requestedCount,
      ),
      derivedContext: {
        category: typeof parsed.category === "string" ? parsed.category : "",
        subcategories: strings(parsed.subcategories),
        audiences: strings(parsed.audiences),
      },
      model: typeof wrapper.model === "string" ? wrapper.model : "unknown",
      costUsd: parseCost(wrapper.usage?.cost),
    };
  } catch (error) {
    throw new Error(
      "OpenRouter did not return validated structured prompt suggestions",
      { cause: error },
    );
  }
}

export function buildPromptSuggestionInstructions(
  context: PromptSuggestionContext,
  count: number,
) {
  return `Return JSON only with keys category, subcategories, audiences, and suggestions. suggestions must contain exactly ${count} objects with value, intent, and branded. Allowed intents: ${promptIntents.join(", ")}. Use a balanced set across intents and mostly generic prompts. Avoid leading questions, unsupported claims, and near-duplicates. Context: ${JSON.stringify(context)}`;
}

export function buildFallbackPromptSuggestions(
  context: PromptSuggestionContext,
  count: number,
  existingPrompts: string[],
) {
  const category = context.category || "products in this category";
  const audience = context.audiences[0] || "teams";
  const competitor = context.competitors[0] || "a leading alternative";
  const candidates: PromptSuggestion[] = [
    {
      value: `What are the best ${category} options for ${audience}?`,
      intent: "category_discovery",
      branded: false,
    },
    {
      value: `Which ${category} is best for ${context.subcategories[0] || "a growing team"}?`,
      intent: "use_case",
      branded: false,
    },
    {
      value: `What ${category} works well for ${audience} in ${context.geography || "my region"}?`,
      intent: "audience_industry",
      branded: false,
    },
    {
      value: `How does ${context.brandName} compare with ${competitor}?`,
      intent: "comparison",
      branded: true,
    },
    {
      value: `What are the best alternatives to ${context.brandName}?`,
      intent: "alternatives",
      branded: true,
    },
    {
      value: `Which ${category} has the easiest implementation and best support?`,
      intent: "evaluation",
      branded: false,
    },
    {
      value: `Which ${category} should ${audience} choose?`,
      intent: "transactional",
      branded: false,
    },
    {
      value: `Is ${context.brandName} a good choice for ${audience}?`,
      intent: "evaluation",
      branded: true,
    },
    {
      value: `Which ${category} offers the best integrations and security?`,
      intent: "evaluation",
      branded: false,
    },
    {
      value: `What should buyers consider before purchasing ${category}?`,
      intent: "transactional",
      branded: false,
    },
    {
      value: `What are affordable ${category} alternatives for ${audience}?`,
      intent: "alternatives",
      branded: false,
    },
    {
      value: `Which ${category} is easiest to use for ${context.subcategories[0] || "daily workflows"}?`,
      intent: "use_case",
      branded: false,
    },
  ];
  return dedupePromptSuggestions(candidates, existingPrompts, count);
}

import { brightDataModelOptions } from "./providers/brightdata";
import { dataForSeoModelOptions } from "./providers/dataforseo";

export interface SurfaceDescriptor {
  /** Normalized provider id, e.g. `brightdata`. */
  provider: string;
  /** Normalized model/target id, e.g. `bing-copilot`. */
  model: string;
  /** Stable identity for a configured surface: `provider:model`. */
  key: string;
  /** Surface name shown to users, e.g. `Bing Copilot`. */
  label: string;
  /** Who runs the surface, e.g. `Bright Data`. */
  providerLabel: string;
}

const providerLabels = new Map<string, string>([
  ["brightdata", "Bright Data"],
  ["dataforseo", "DataForSEO"],
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["openrouter", "OpenRouter"],
]);

const targetLabels = new Map<string, string>([
  ...brightDataModelOptions.map(
    (option) => [option.id, option.label] as [string, string],
  ),
  ...dataForSeoModelOptions.map(
    (option) => [option.id, option.label] as [string, string],
  ),
]);

// Direct-API providers store raw model ids rather than a scraper target id.
const modelFamilies: Array<[RegExp, string]> = [
  [/^(chatgpt|gpt-)/, "ChatGPT"],
  [/^claude/, "Claude"],
  [/^gemini/, "Gemini"],
  [/^(perplexity|sonar)/, "Perplexity"],
];

// OpenRouter ids are `vendor/model`; match on the model half.
function modelFamily(modelId: string): string | undefined {
  const slug = modelId.slice(modelId.indexOf("/") + 1);
  return modelFamilies.find(([pattern]) => pattern.test(slug))?.[1];
}

export function surfaceKey(provider: string, model: string): string {
  return `${provider.trim().toLowerCase()}:${model.trim().toLowerCase()}`;
}

/**
 * Names a single configured answer surface. Every view that reports per-surface
 * numbers should resolve its labels here so a number can always be mapped back
 * to the provider target that produced it.
 */
export function describeSurface(
  provider: string,
  model: string,
): SurfaceDescriptor {
  const providerId = provider.trim().toLowerCase();
  const modelId = model.trim().toLowerCase();
  const providerLabel =
    providerLabels.get(providerId) ?? (provider.trim() || "Unknown provider");
  const label =
    targetLabels.get(modelId) ??
    modelFamily(modelId) ??
    (model.trim() || providerLabel);
  return {
    provider: providerId,
    model: modelId,
    key: `${providerId}:${modelId}`,
    label,
    providerLabel,
  };
}

/**
 * Deduplicates surfaces by identity, keeping the first occurrence. Callers that
 * want a presentation order should sort the result with `compareSurfaces`.
 */
export function uniqueSurfaces(
  surfaces: Array<{ provider: string; model: string }>,
): SurfaceDescriptor[] {
  const seen = new Set<string>();
  const ordered: SurfaceDescriptor[] = [];
  for (const surface of surfaces) {
    const descriptor = describeSurface(surface.provider, surface.model);
    if (seen.has(descriptor.key)) continue;
    seen.add(descriptor.key);
    ordered.push(descriptor);
  }
  return ordered;
}

const providerOrder = [
  "brightdata",
  "dataforseo",
  "openai",
  "anthropic",
  "openrouter",
];

const surfaceOrder = new Map<string, number>(
  [
    ...brightDataModelOptions.map(
      (option) => `brightdata:${option.id}` as string,
    ),
    ...dataForSeoModelOptions.map(
      (option) => `dataforseo:${option.id}` as string,
    ),
  ].map((key, index) => [key, index]),
);

function rank(values: string[], value: string): number {
  const index = values.indexOf(value);
  return index === -1 ? values.length : index;
}

/**
 * Orders surfaces the way the product lists them elsewhere: known scraper
 * targets in the order their adapter declares, then anything else grouped by
 * provider. Independent of database row order, so report rows stay stable.
 */
export function compareSurfaces(
  left: SurfaceDescriptor,
  right: SurfaceDescriptor,
): number {
  const leftKnown = surfaceOrder.get(left.key);
  const rightKnown = surfaceOrder.get(right.key);
  if (leftKnown !== undefined || rightKnown !== undefined) {
    return (
      (leftKnown ?? surfaceOrder.size) - (rightKnown ?? surfaceOrder.size) ||
      left.key.localeCompare(right.key)
    );
  }
  return (
    rank(providerOrder, left.provider) - rank(providerOrder, right.provider) ||
    left.provider.localeCompare(right.provider) ||
    left.label.localeCompare(right.label) ||
    left.model.localeCompare(right.model)
  );
}

export interface CitationSurfaceCoverage {
  surface: string;
  provider: string;
  model: string;
  providerLabel: string;
  successfulRuns: number;
  citations: number;
  /**
   * True when the surface returned answers but none of them carried a source.
   * Distinguishes "this surface cannot show its evidence" from "no data yet",
   * which a table of citation rows alone cannot express.
   */
  sourcesUnavailable: boolean;
}

/**
 * Summarises what each answer surface contributed to the citation record.
 * A surface with zero citations is reported rather than omitted, so it is
 * visible that the number is an integration limit and not an absence of runs.
 *
 * Rows are already grouped per surface by the caller — summing per-run rows
 * here would mean reading every run a project has ever recorded.
 */
export function citationSurfaceCoverage(
  surfaces: Array<{
    provider: string;
    model: string;
    successfulRuns: number;
    citations: number;
  }>,
): CitationSurfaceCoverage[] {
  return surfaces
    .map((row) => {
      const surface = describeSurface(row.provider, row.model);
      const successfulRuns = Number(row.successfulRuns) || 0;
      const citations = Number(row.citations) || 0;
      return {
        surface: surface.label,
        provider: surface.provider,
        model: surface.model,
        providerLabel: surface.providerLabel,
        successfulRuns,
        citations,
        sourcesUnavailable: successfulRuns > 0 && citations === 0,
      };
    })
    .sort((left, right) =>
      compareSurfaces(
        describeSurface(left.provider, left.model),
        describeSurface(right.provider, right.model),
      ),
    );
}

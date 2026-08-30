import { redactDataUriPayloads } from "./providers/shared.js";
import type { TrackableEntity } from "./types.js";

export interface CompetitorDiscoveryRun {
  id: string;
  promptId: string;
  prompt: string;
  provider: string;
  model: string;
  answer: string;
  completedAt: string;
}

export interface CompetitorEvidence {
  runId: string;
  promptId: string;
  prompt: string;
  provider: string;
  model: string;
  excerpt: string;
  completedAt: string;
}

export interface CompetitorSuggestionResult {
  key: string;
  name: string;
  aliases: string[];
  mentionCount: number;
  mentionPercentage: number;
  promptCount: number;
  providerCount: number;
  confidenceScore: number;
  confidence: "low" | "medium" | "high";
  evidence: CompetitorEvidence[];
}

interface EvidenceCounts {
  mentionCount: number;
  promptCount: number;
  providerCount: number;
  evidenceRunIds?: string[];
  evidencePromptIds?: string[];
  evidenceProviders?: string[];
  dismissedAt?: string | Date;
}

const corporateSuffix =
  /(?:\s+(?:incorporated|inc\.?|llc|ltd\.?|corp(?:oration)?\.?|company|co\.?)|[.\s]+ai)$/i;
const genericOrPublisher = new Set(
  [
    "ai",
    "aeo",
    "the",
    "consider",
    "however",
    "this",
    "that",
    "these",
    "those",
    "many",
    "most",
    "some",
    "other",
    "another",
    "overall",
    "for",
    "while",
    "when",
    "because",
    "although",
    "depending",
    "note",
    "finally",
    "first",
    "second",
    "here",
    "there",
    "top tools",
    "best tools",
    "ai visibility",
    "aeo software",
    "enterprise software",
    "software",
    "platform",
    "platforms",
    "tool",
    "tools",
    "solution",
    "solutions",
    "option",
    "options",
    "service",
    "services",
    "forbes",
    "wikipedia",
    "reddit",
    "youtube",
    "linkedin",
    "gartner",
    "google news",
    "amazon",
  ].map(normalizeCompetitorKey),
);
const genericTokens = new Set([
  "ai",
  "aeo",
  "best",
  "top",
  "enterprise",
  "visibility",
  "category",
  "categories",
  "software",
  "platform",
  "platforms",
  "tool",
  "tools",
  "solution",
  "solutions",
  "option",
  "options",
  "service",
  "services",
]);

export function normalizeCompetitorName(value: string): string {
  return value
    .replace(/[*_`~#[\](){}]/g, "")
    .replace(/^(?:consider|choose|try|use|compare|including|like)\s+/i, "")
    .replace(/[.,:;!?]+$/g, "")
    .replace(corporateSuffix, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompetitorKey(value: string): string {
  return normalizeCompetitorName(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

/**
 * A word that cannot be part of a name.
 *
 * Deliberately narrow: only a long run of pure base64 alphabet, which no brand
 * name reaches. A general "looks encoded" score was tried and rejected
 * Shift4Shop — the current name of 3dcart — along with Microsoft365,
 * Salesforce-Commerce-Cloud and every non-Latin-script name, because a shape
 * heuristic cannot separate an unusual name from an encoded one.
 *
 * The real defence is stripping the payload before extraction, in
 * discoverCompetitors. This only catches a leak arriving by another route, and
 * it rejects the whole candidate rather than splicing words out of it: dropping
 * a word from the middle fuses its neighbours into a name that never appeared
 * in the answer.
 */
function isEncodedRun(word: string): boolean {
  if (!/^[A-Za-z0-9+/=]+$/.test(word)) return false;
  // Longer than any single-word brand.
  if (word.length >= 24) return true;
  const hasDigit = /\d/.test(word);
  // The capitalised-run pattern splits a blob at "/" and "=", so the fragments
  // that reach here are often shorter than a whole payload.
  if (
    word.length >= 16 &&
    hasDigit &&
    /[a-z]/.test(word) &&
    /[A-Z]/.test(word)
  ) {
    return true;
  }
  return word.length >= 12 && hasDigit && !/[a-z]/.test(word);
}

function candidateNames(answer: string): string[] {
  const capitalized = [
    ...answer.matchAll(
      /(?<![\p{L}\p{N}])\p{Lu}[\p{L}\p{N}.'’+-]*(?:[ \t]+(?:(?:of|the|&)[ \t]+)?(?:\p{Lu}[\p{L}\p{N}.'’+-]*|AI)){0,3}(?![\p{L}\p{N}])/gu,
    ),
  ].map((match) => match[0]);
  const emphasized = [
    ...answer.matchAll(/(?:\*\*|__)([^*_\n]{2,120})(?:\*\*|__)/g),
  ].flatMap((match) => (match[1] ? [match[1]] : []));
  return [...capitalized, ...emphasized]
    .map(normalizeCompetitorName)
    .filter((name) => name.length >= 2 && name.length <= 120)
    .filter((name) => !name.split(/\s+/).some(isEncodedRun))
    .filter((name) => !genericOrPublisher.has(normalizeCompetitorKey(name)))
    .filter((name) => {
      const tokens = name
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
      return (
        !tokens.length || !tokens.every((token) => genericTokens.has(token))
      );
    });
}

function excerptFor(answer: string, name: string): string {
  const index = answer.toLowerCase().indexOf(name.toLowerCase());
  if (index < 0) return answer.slice(0, 220);
  const start = Math.max(0, index - 80);
  const end = Math.min(answer.length, index + name.length + 120);
  return `${start > 0 ? "…" : ""}${answer.slice(start, end).trim()}${end < answer.length ? "…" : ""}`;
}

export function hasMateriallyNewEvidence(
  dismissed: EvidenceCounts,
  current: EvidenceCounts & { evidence?: CompetitorEvidence[] },
): boolean {
  const dismissedAt = dismissed.dismissedAt
    ? new Date(dismissed.dismissedAt).getTime()
    : Number.NEGATIVE_INFINITY;
  const priorRunIds = new Set(dismissed.evidenceRunIds ?? []);
  const priorPromptIds = new Set(dismissed.evidencePromptIds ?? []);
  const priorProviders = new Set(dismissed.evidenceProviders ?? []);
  return (current.evidence ?? []).some(
    (item) =>
      !priorRunIds.has(item.runId) &&
      new Date(item.completedAt).getTime() > dismissedAt &&
      (priorPromptIds.size || priorProviders.size
        ? !priorPromptIds.has(item.promptId) ||
          !priorProviders.has(item.provider)
        : current.promptCount > dismissed.promptCount ||
          current.providerCount > dismissed.providerCount),
  );
}

export function discoverCompetitors(input: {
  runs: CompetitorDiscoveryRun[];
  brand: TrackableEntity;
  existingCompetitors: TrackableEntity[];
  minimumMentions?: number;
}): { answersAnalyzed: number; suggestions: CompetitorSuggestionResult[] } {
  const excluded = new Set<string>();
  for (const entity of [input.brand, ...input.existingCompetitors]) {
    excluded.add(normalizeCompetitorKey(entity.name));
    for (const alias of entity.aliases ?? []) {
      excluded.add(normalizeCompetitorKey(alias));
    }
  }
  const found = new Map<
    string,
    { names: Map<string, number>; evidence: CompetitorEvidence[] }
  >();

  for (const run of input.runs) {
    const perRun = new Map<string, string>();
    // Redact inlined payloads before extraction. Base64 from a favicon is
    // matched by the capitalised-run pattern below, and production offered ten
    // such blobs for approval. Doing it here also covers answers stored before
    // the provider-side stripper was fixed, with no backfill.
    //
    // Redacting to a separator, not removing: the production shape puts a
    // favicon between two source names, and closing that gap would fuse them
    // into one candidate that never appeared in the answer.
    const prose = redactDataUriPayloads(run.answer);
    for (const name of candidateNames(prose)) {
      const key = normalizeCompetitorKey(name);
      if (!key || excluded.has(key)) continue;
      perRun.set(key, name);
    }
    for (const [key, name] of perRun) {
      const entry = found.get(key) ?? {
        names: new Map<string, number>(),
        evidence: [] as CompetitorEvidence[],
      };
      entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
      entry.evidence.push({
        runId: run.id,
        promptId: run.promptId,
        prompt: run.prompt,
        provider: run.provider,
        model: run.model,
        excerpt: excerptFor(prose, name),
        completedAt: run.completedAt,
      });
      found.set(key, entry);
    }
  }

  const minimumMentions = input.minimumMentions ?? 2;
  const suggestions = [...found.entries()].flatMap(([key, entry]) => {
    const promptCount = new Set(entry.evidence.map((item) => item.promptId))
      .size;
    const providerCount = new Set(entry.evidence.map((item) => item.provider))
      .size;
    if (
      entry.evidence.length < minimumMentions ||
      (promptCount < 2 && providerCount < 2)
    )
      return [];
    const names = [...entry.names].sort(
      (left, right) => right[1] - left[1] || left[0].length - right[0].length,
    );
    const name = names[0]?.[0] ?? key;
    const diversity = Math.min(1, (promptCount / 3 + providerCount / 2) / 2);
    const frequency = Math.min(
      1,
      entry.evidence.length / Math.max(3, input.runs.length),
    );
    const confidenceScore = Math.round(
      (diversity * 0.7 + frequency * 0.3) * 100,
    );
    return [
      {
        key,
        name,
        aliases: names.slice(1).map(([alias]) => alias),
        mentionCount: entry.evidence.length,
        mentionPercentage: input.runs.length
          ? Math.round((entry.evidence.length / input.runs.length) * 100)
          : 0,
        promptCount,
        providerCount,
        confidenceScore,
        confidence:
          confidenceScore >= 75
            ? ("high" as const)
            : confidenceScore >= 50
              ? ("medium" as const)
              : ("low" as const),
        evidence: entry.evidence,
      },
    ];
  });
  suggestions.sort(
    (left, right) =>
      right.confidenceScore - left.confidenceScore ||
      right.mentionCount - left.mentionCount ||
      left.name.localeCompare(right.name),
  );
  return { answersAnalyzed: input.runs.length, suggestions };
}

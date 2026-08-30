import { analyzeAnswer, normalizeDomain } from "./analysis.js";
import type {
  CitationCategory,
  CitationResult,
  TrackableEntity,
} from "./types.js";

export type RecommendationStrength =
  "best_overall" | "top_choice" | "alternative" | "neutral_mention";

export type EvidenceSentiment = "positive" | "neutral" | "negative";

export interface EvidenceClaim {
  text: string;
  confidence: number;
}

export interface EvidenceAnalysis {
  brandMentioned: boolean;
  competitorsMentioned: string[];
  recommendationRank: number | null;
  recommendationStrength: RecommendationStrength | null;
  sentiment: EvidenceSentiment;
  claims: EvidenceClaim[];
}

export interface NormalizedCitation {
  rawUrl: string;
  finalUrl: string;
  canonicalUrl: string;
  domain: string;
  pageTitle?: string;
  position: number;
  category?: CitationCategory;
  competitorName?: string;
}

export type OpportunityType =
  | "citation_gap"
  | "content_authority"
  | "winning_message"
  | "competitor_advantage"
  | "unsupported_claim"
  | "reliability_warning";

export interface OpportunityDraft {
  type: OpportunityType;
  fingerprint: string;
  priority: number;
  confidence: number;
  earlySignal: boolean;
  title: string;
  explanation: string;
  recommendedAction: string;
  evidenceIds: string[];
  affectedPromptIds: string[];
  affectedUrls: string[];
}

export interface RunOpportunityInput {
  projectId: string;
  promptId: string;
  runId: string;
  provider: string;
  analysis: EvidenceAnalysis;
  citations: NormalizedCitation[];
  observationCount: number;
  agreeingProviders: number;
}

const TRACKING_PARAMETERS = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "gbraid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "ref",
  "ref_src",
  "srsltid",
  "wbraid",
]);

function redirectDestination(url: URL): string | null {
  const hostname = normalizeDomain(url.hostname);
  if (!domainMatches(hostname, "google.com") || url.pathname !== "/goto") {
    return null;
  }
  return (
    url.searchParams.get("url") ??
    url.searchParams.get("q") ??
    url.searchParams.get("target")
  );
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function canonicalizeUrl(value: string): string {
  const url = parseUrl(value);
  if (!url) return value.trim();
  url.hostname = normalizeDomain(url.hostname);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.startsWith("utm_") ||
      TRACKING_PARAMETERS.has(normalizedKey)
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function domainMatches(domain: string, candidate: string): boolean {
  return domain === candidate || domain.endsWith(`.${candidate}`);
}

export function normalizeCitationUrl(
  citation: CitationResult,
): NormalizedCitation {
  const rawUrl = citation.url.trim();
  const parsedRaw = parseUrl(rawUrl);
  const unwrapped = parsedRaw ? redirectDestination(parsedRaw) : null;
  const finalUrl = unwrapped?.trim() || rawUrl;
  const canonicalUrl = canonicalizeUrl(finalUrl);
  const canonical = parseUrl(canonicalUrl);
  return {
    rawUrl,
    finalUrl,
    canonicalUrl,
    domain: canonical
      ? normalizeDomain(canonical.hostname)
      : normalizeDomain(citation.domain),
    ...(citation.title ? { pageTitle: citation.title } : {}),
    position: citation.position,
  };
}

const POSITIVE_WORDS = [
  "best",
  "excellent",
  "leading",
  "recommended",
  "reliable",
  "strong",
  "top",
];
const NEGATIVE_WORDS = ["avoid", "limited", "poor", "risk", "weak", "worst"];

function countWords(content: string, words: string[]): number {
  return words.reduce((total, word) => {
    const matches = content.match(new RegExp(`\\b${word}\\b`, "gi"));
    return total + (matches?.length ?? 0);
  }, 0);
}

function sentenceClaims(
  answer: string,
  brand: TrackableEntity,
): EvidenceClaim[] {
  const sentences = answer
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12);
  return sentences
    .filter((sentence) => analyzeAnswer(sentence, brand, []).brandMentioned)
    .slice(0, 20)
    .map((text) => ({
      text,
      confidence: 0.82,
    }));
}

export function analyzeEvidence(
  answer: string,
  brand: TrackableEntity,
  competitors: TrackableEntity[],
): EvidenceAnalysis {
  const mentions = analyzeAnswer(answer, brand, competitors);
  const normalized = answer.toLowerCase();
  let recommendationStrength: RecommendationStrength | null = null;
  let recommendationRank: number | null = null;

  if (mentions.brandMentioned) {
    if (/\bbest overall\b|\bbest choice\b/.test(normalized)) {
      recommendationStrength = "best_overall";
      recommendationRank = 1;
    } else if (
      /\btop choice\b|\bleading option\b|\brecommend(?:ed)?\b/.test(normalized)
    ) {
      recommendationStrength = "top_choice";
      recommendationRank = 1;
    } else if (
      /\balternative\b|\balso consider\b|\brunner-up\b/.test(normalized)
    ) {
      recommendationStrength = "alternative";
      recommendationRank = 2;
    } else {
      recommendationStrength = "neutral_mention";
    }
  }

  const positive = countWords(normalized, POSITIVE_WORDS);
  const negative = countWords(normalized, NEGATIVE_WORDS);
  const sentiment: EvidenceSentiment =
    positive > negative
      ? "positive"
      : negative > positive
        ? "negative"
        : "neutral";

  return {
    ...mentions,
    recommendationRank,
    recommendationStrength,
    sentiment,
    claims: sentenceClaims(answer, brand),
  };
}

function evidenceConfidence(
  observationCount: number,
  agreeingProviders: number,
): number {
  const observationScore = Math.min(40, Math.max(1, observationCount) * 10);
  const providerScore = Math.min(35, Math.max(1, agreeingProviders) * 12);
  return Math.min(95, 25 + observationScore + providerScore);
}

function draft(
  input: RunOpportunityInput,
  values: Omit<
    OpportunityDraft,
    "confidence" | "earlySignal" | "evidenceIds" | "affectedPromptIds"
  >,
): OpportunityDraft {
  return {
    ...values,
    confidence: evidenceConfidence(
      input.observationCount,
      input.agreeingProviders,
    ),
    earlySignal: input.observationCount < 2,
    evidenceIds: [input.runId],
    affectedPromptIds: [input.promptId],
  };
}

export function generateRunOpportunities(
  input: RunOpportunityInput,
): OpportunityDraft[] {
  const owned = input.citations.filter(
    (citation) => citation.category === "owned",
  );
  const competitor = input.citations.filter(
    (citation) => citation.category === "competitor",
  );
  const allUrls = input.citations.map((citation) => citation.canonicalUrl);
  const opportunities: OpportunityDraft[] = [];

  if (competitor.length > 0 && owned.length === 0) {
    opportunities.push(
      draft(input, {
        type: "citation_gap",
        fingerprint: `citation_gap:${input.projectId}:${input.promptId}`,
        priority: 88,
        title: "Competitors are earning the citations",
        explanation:
          "The answer cites a competitor source without citing an owned page.",
        recommendedAction:
          "Create or strengthen an owned page that directly answers this prompt with verifiable evidence.",
        affectedUrls: competitor.map((citation) => citation.canonicalUrl),
      }),
    );
  }

  if (input.analysis.brandMentioned && owned.length === 0) {
    opportunities.push(
      draft(input, {
        type: "content_authority",
        fingerprint: `content_authority:${input.projectId}:${input.promptId}`,
        priority: 82,
        title: "Your brand is visible, but your site is not the source",
        explanation:
          "The answer mentions the brand without citing an owned domain.",
        recommendedAction:
          "Add stronger first-party proof and make the relevant page easier for answer engines to cite.",
        affectedUrls: allUrls,
      }),
    );
  }

  if (
    input.analysis.brandMentioned &&
    input.analysis.recommendationRank === 1 &&
    owned.length > 0
  ) {
    opportunities.push(
      draft(input, {
        type: "winning_message",
        fingerprint: `winning_message:${input.projectId}:${input.promptId}`,
        priority: 66,
        title: "A winning message is ready to expand",
        explanation:
          "The brand ranks first and the answer supports it with an owned citation.",
        recommendedAction:
          "Reuse the cited proof across adjacent high-intent pages and prompts.",
        affectedUrls: owned.map((citation) => citation.canonicalUrl),
      }),
    );
  }

  if (
    !input.analysis.brandMentioned &&
    input.analysis.competitorsMentioned.length > 0
  ) {
    opportunities.push(
      draft(input, {
        type: "competitor_advantage",
        fingerprint: `competitor_advantage:${input.projectId}:${input.promptId}`,
        priority: 91,
        title: "A competitor owns this answer",
        explanation:
          "The answer mentions a tracked competitor but does not mention the brand.",
        recommendedAction:
          "Review the competitor's cited proof and publish a clearer, differentiated answer.",
        affectedUrls: allUrls,
      }),
    );
  }

  if (input.analysis.claims.length > 0 && input.citations.length === 0) {
    opportunities.push(
      draft(input, {
        type: "unsupported_claim",
        fingerprint: `unsupported_claim:${input.projectId}:${input.promptId}`,
        priority: 78,
        title: "Brand claims are appearing without evidence",
        explanation:
          "The answer makes claims about the brand but provides no citations.",
        recommendedAction:
          "Publish primary evidence for the repeated claims and link it from the most relevant page.",
        affectedUrls: [],
      }),
    );
  }

  return opportunities;
}

export function generateReliabilityOpportunity(input: {
  projectId: string;
  provider: string;
  observations: Array<{ runId: string; status: "succeeded" | "failed" }>;
}): OpportunityDraft | null {
  const failures = input.observations
    .filter((observation) => observation.status === "failed")
    .map((observation) => observation.runId);
  if (failures.length < 3) return null;
  const failureRate = failures.length / input.observations.length;
  return {
    type: "reliability_warning",
    fingerprint: `reliability_warning:${input.projectId}:${input.provider}`,
    priority: Math.round(72 + failureRate * 20),
    confidence: Math.min(95, 55 + input.observations.length * 7),
    earlySignal: input.observations.length < 5,
    title: `${input.provider} results are becoming unreliable`,
    explanation: `${failures.length} of the ${input.observations.length} most recent runs failed.`,
    recommendedAction:
      "Review provider errors before treating missing visibility as a real result.",
    evidenceIds: failures,
    affectedPromptIds: [],
    affectedUrls: [],
  };
}

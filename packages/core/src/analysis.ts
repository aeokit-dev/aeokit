import type {
  CitationClassification,
  RunAnalysis,
  TrackableEntity,
} from "./types.js";

const SOCIAL_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "reddit.com",
  "tiktok.com",
  "x.com",
  "youtube.com",
]);

const INSTITUTIONAL_SUFFIXES = [".edu", ".gov", ".org"];

export function normalizeDomain(value: string): string {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return "";
  try {
    return new URL(
      candidate.includes("://") ? candidate : `https://${candidate}`,
    ).hostname.replace(/^www\./, "");
  } catch {
    return candidate.replace(/^www\./, "").split("/")[0] ?? candidate;
  }
}

function includesPhrase(content: string, phrase: string): boolean {
  const normalized = phrase.trim().toLowerCase();
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(content);
}

function entityMentioned(content: string, entity: TrackableEntity): boolean {
  const names = [entity.name, ...(entity.aliases ?? [])];
  const domains = (entity.domains ?? []).map(normalizeDomain).filter(Boolean);
  return (
    names.some((name) => includesPhrase(content, name)) ||
    domains.some((domain) => content.includes(domain))
  );
}

export function analyzeAnswer(
  answer: string,
  brand: TrackableEntity,
  competitors: TrackableEntity[],
): RunAnalysis {
  const content = answer.toLowerCase();
  return {
    brandMentioned: entityMentioned(content, brand),
    competitorsMentioned: competitors
      .filter((competitor) => entityMentioned(content, competitor))
      .map((competitor) => competitor.name),
  };
}

function domainMatches(domain: string, candidate: string): boolean {
  return domain === candidate || domain.endsWith(`.${candidate}`);
}

export function classifyCitation(
  domainValue: string,
  brandDomains: string[],
  competitors: TrackableEntity[],
): CitationClassification {
  const domain = normalizeDomain(domainValue);
  if (
    brandDomains
      .map(normalizeDomain)
      .some((item) => domainMatches(domain, item))
  ) {
    return { category: "owned" };
  }

  for (const competitor of competitors) {
    const match = (competitor.domains ?? [])
      .map(normalizeDomain)
      .some((item) => domainMatches(domain, item));
    if (match)
      return { category: "competitor", competitorName: competitor.name };
  }

  if ([...SOCIAL_DOMAINS].some((item) => domainMatches(domain, item))) {
    return { category: "social" };
  }
  if (INSTITUTIONAL_SUFFIXES.some((suffix) => domain.endsWith(suffix))) {
    return { category: "institutional" };
  }
  return { category: "other" };
}

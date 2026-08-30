export const AI_REFERRER_SOURCES = [
  { domain: "chatgpt.com", label: "ChatGPT" },
  { domain: "claude.ai", label: "Claude" },
  { domain: "gemini.google.com", label: "Gemini" },
  { domain: "perplexity.ai", label: "Perplexity" },
  { domain: "copilot.microsoft.com", label: "Microsoft Copilot" },
  { domain: "meta.ai", label: "Meta AI" },
  { domain: "chat.deepseek.com", label: "DeepSeek" },
  { domain: "chat.mistral.ai", label: "Le Chat" },
  { domain: "poe.com", label: "Poe" },
  { domain: "you.com", label: "You.com" },
] as const;

export type AiReferralPeriod = "7d" | "30d" | "90d";

export interface PostHogReferralsEnvironment {
  POSTHOG_HOST?: string;
  POSTHOG_PROJECT_ID?: string;
  POSTHOG_PERSONAL_API_KEY?: string;
  POSTHOG_SUCCESS_EVENTS?: string | readonly string[];
  /** Legacy single-event configurations. Prefer POSTHOG_SUCCESS_EVENTS. */
  POSTHOG_SEARCH_EVENT?: string;
  POSTHOG_STOCK_ALERT_EVENT?: string;
}

export interface AiReferralMetrics {
  sessions: number;
  pageviews: number;
  convertingSessions: number | null;
  conversions: number | null;
  conversionRate: number | null;
  averageSessionDurationSeconds: number | null;
  bounceRate: number | null;
}

export interface AiReferralLandingPage extends AiReferralMetrics {
  path: string;
  trackedCitationCount: number;
}

export interface AiReferralSource extends AiReferralMetrics {
  domain: string;
  label: string;
  landingPages: AiReferralLandingPage[];
}

export interface AiReferralsData {
  period: AiReferralPeriod;
  siteHost: string;
  successEvents: string[];
  totals: AiReferralMetrics;
  previousPeriod: AiReferralMetrics;
  sources: AiReferralSource[];
  citedLandingPageSessions: number;
  trackedCitationCount: number;
  queriedAt: string;
  cached: boolean;
}

interface PostHogQueryResponse {
  results?: unknown;
  is_cached?: boolean;
  detail?: string;
  error?: string;
}

interface RawMetrics {
  sessions: number;
  pageviews: number;
  convertingSessions: number;
  conversions: number;
  durationSeconds: number;
  durationObservations: number;
  bounces: number;
  bounceObservations: number;
}

const periodDays: Record<AiReferralPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

export function normalizePostHogSuccessEvents(
  value: string | readonly string[] | null | undefined,
): string[] {
  const values =
    typeof value === "string" ? value.split(",") : value ? [...value] : [];
  return [
    ...new Set(
      values
        .map((event) => event.trim())
        .filter((event) => event.length > 0 && event.length <= 200),
    ),
  ].slice(0, 10);
}

export function postHogReferralsConfiguration(
  environment: PostHogReferralsEnvironment,
) {
  const missing = [
    !trimmed(environment.POSTHOG_HOST) && "POSTHOG_HOST",
    !trimmed(environment.POSTHOG_PROJECT_ID) && "POSTHOG_PROJECT_ID",
    !trimmed(environment.POSTHOG_PERSONAL_API_KEY) &&
      "POSTHOG_PERSONAL_API_KEY",
  ].filter((value): value is string => Boolean(value));
  const configuredEvents =
    environment.POSTHOG_SUCCESS_EVENTS ??
    [
      trimmed(environment.POSTHOG_SEARCH_EVENT),
      trimmed(environment.POSTHOG_STOCK_ALERT_EVENT),
    ].filter((event): event is string => Boolean(event));

  return {
    configured: missing.length === 0,
    missing,
    successEvents: normalizePostHogSuccessEvents(configuredEvents),
  };
}

function hogqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function normalizeSiteHost(website: string): string {
  const hostname = new URL(website).hostname.toLowerCase();
  return hostname.replace(/^www\./, "");
}

function eventList(events: readonly string[]): string {
  return events.map(hogqlString).join(", ");
}

export function buildPostHogAiReferralsQuery({
  website,
  period,
  successEvents,
}: {
  website: string;
  period: AiReferralPeriod;
  successEvents: readonly string[];
}): string {
  const siteHost = normalizeSiteHost(website);
  const days = periodDays[period];
  const normalizedSuccessEvents = normalizePostHogSuccessEvents(successEvents);
  const selectedEvents = ["$pageview", ...normalizedSuccessEvents];
  const conversionCount = normalizedSuccessEvents.length
    ? `countIf(event IN (${eventList(normalizedSuccessEvents)}))`
    : "0";
  const referralDomains = AI_REFERRER_SOURCES.map(({ domain }) =>
    hogqlString(domain),
  ).join(", ");

  return `SELECT
    period_bucket,
    referring_domain,
    if(empty(entry_path), '/', entry_path) AS landing_path,
    path_sessions,
    path_pageviews,
    path_converting_sessions,
    path_conversions,
    path_duration_seconds,
    path_duration_observations,
    path_bounces,
    path_bounce_observations,
    source_sessions,
    source_pageviews,
    source_converting_sessions,
    source_conversions,
    source_duration_seconds,
    source_duration_observations,
    source_bounces,
    source_bounce_observations
FROM (
    SELECT
        period_bucket,
        referring_domain,
        entry_path,
        path_sessions,
        path_pageviews,
        path_converting_sessions,
        path_conversions,
        path_duration_seconds,
        path_duration_observations,
        path_bounces,
        path_bounce_observations,
        sum(path_sessions) OVER (PARTITION BY period_bucket, referring_domain) AS source_sessions,
        sum(path_pageviews) OVER (PARTITION BY period_bucket, referring_domain) AS source_pageviews,
        sum(path_converting_sessions) OVER (PARTITION BY period_bucket, referring_domain) AS source_converting_sessions,
        sum(path_conversions) OVER (PARTITION BY period_bucket, referring_domain) AS source_conversions,
        sum(path_duration_seconds) OVER (PARTITION BY period_bucket, referring_domain) AS source_duration_seconds,
        sum(path_duration_observations) OVER (PARTITION BY period_bucket, referring_domain) AS source_duration_observations,
        sum(path_bounces) OVER (PARTITION BY period_bucket, referring_domain) AS source_bounces,
        sum(path_bounce_observations) OVER (PARTITION BY period_bucket, referring_domain) AS source_bounce_observations,
        row_number() OVER (PARTITION BY period_bucket, referring_domain ORDER BY path_sessions DESC, entry_path ASC) AS landing_rank
    FROM (
        SELECT
            if(entry_timestamp >= now() - INTERVAL ${days} DAY, 'current', 'previous') AS period_bucket,
            referring_domain,
            entry_path,
            count() AS path_sessions,
            sum(pageview_count) AS path_pageviews,
            countIf(conversion_count > 0) AS path_converting_sessions,
            sum(conversion_count) AS path_conversions,
            sum(ifNull(session_duration_seconds, 0)) AS path_duration_seconds,
            countIf(notEquals(session_duration_seconds, NULL)) AS path_duration_observations,
            sum(if(is_bounce, 1, 0)) AS path_bounces,
            countIf(notEquals(is_bounce, NULL)) AS path_bounce_observations
        FROM (
            SELECT
                toString(properties.$session_id) AS session_id,
                minIf(timestamp, event = '$pageview') AS entry_timestamp,
                replaceRegexpOne(lower(toString(argMinIf(properties.$referring_domain, timestamp, event = '$pageview'))), '^www\\\\.', '') AS referring_domain,
                replaceRegexpOne(lower(toString(argMinIf(properties.$host, timestamp, event = '$pageview'))), '^www\\\\.', '') AS entry_host,
                toString(argMinIf(properties.$pathname, timestamp, event = '$pageview')) AS entry_path,
                countIf(event = '$pageview') AS pageview_count,
                ${conversionCount} AS conversion_count,
                any(session.$session_duration) AS session_duration_seconds,
                any(session.$is_bounce) AS is_bounce
            FROM events
            WHERE timestamp >= now() - INTERVAL ${days * 2} DAY
              AND timestamp < now()
              AND event IN (${eventList(selectedEvents)})
              AND notEquals(toString(properties.$session_id), '')
            GROUP BY session_id
            HAVING pageview_count > 0
        )
        WHERE entry_host = ${hogqlString(siteHost)}
          AND referring_domain IN (${referralDomains})
        GROUP BY period_bucket, referring_domain, entry_path
    )
)
WHERE landing_rank <= 25
ORDER BY period_bucket ASC, source_sessions DESC, referring_domain ASC, landing_rank ASC
LIMIT 500`;
}

function numeric(value: unknown): number {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

function rawMetrics(row: unknown[], offset: number): RawMetrics {
  return {
    sessions: numeric(row[offset]),
    pageviews: numeric(row[offset + 1]),
    convertingSessions: numeric(row[offset + 2]),
    conversions: numeric(row[offset + 3]),
    durationSeconds: numeric(row[offset + 4]),
    durationObservations: numeric(row[offset + 5]),
    bounces: numeric(row[offset + 6]),
    bounceObservations: numeric(row[offset + 7]),
  };
}

function publicMetrics(
  metrics: RawMetrics,
  conversionsConfigured: boolean,
): AiReferralMetrics {
  return {
    sessions: metrics.sessions,
    pageviews: metrics.pageviews,
    convertingSessions: conversionsConfigured
      ? metrics.convertingSessions
      : null,
    conversions: conversionsConfigured ? metrics.conversions : null,
    conversionRate:
      conversionsConfigured && metrics.sessions > 0
        ? metrics.convertingSessions / metrics.sessions
        : null,
    averageSessionDurationSeconds:
      metrics.durationObservations > 0
        ? metrics.durationSeconds / metrics.durationObservations
        : null,
    bounceRate:
      metrics.bounceObservations > 0
        ? metrics.bounces / metrics.bounceObservations
        : null,
  };
}

function aggregateRawMetrics(metrics: Iterable<RawMetrics>): RawMetrics {
  const total: RawMetrics = {
    sessions: 0,
    pageviews: 0,
    convertingSessions: 0,
    conversions: 0,
    durationSeconds: 0,
    durationObservations: 0,
    bounces: 0,
    bounceObservations: 0,
  };
  for (const value of metrics) {
    total.sessions += value.sessions;
    total.pageviews += value.pageviews;
    total.convertingSessions += value.convertingSessions;
    total.conversions += value.conversions;
    total.durationSeconds += value.durationSeconds;
    total.durationObservations += value.durationObservations;
    total.bounces += value.bounces;
    total.bounceObservations += value.bounceObservations;
  }
  return total;
}

export function aggregatePostHogAiReferralRows(
  rows: unknown,
  successEvents: readonly string[],
): Pick<AiReferralsData, "totals" | "previousPeriod" | "sources"> {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const conversionsConfigured = successEvents.length > 0;
  const periodSources = new Map<string, RawMetrics>();
  const currentSources = new Map<string, AiReferralSource>();

  for (const rawRow of sourceRows) {
    if (!Array.isArray(rawRow) || rawRow.length < 19) continue;
    const periodBucket =
      rawRow[0] === "current" || rawRow[0] === "previous" ? rawRow[0] : null;
    const domain = typeof rawRow[1] === "string" ? rawRow[1].toLowerCase() : "";
    const knownSource = AI_REFERRER_SOURCES.find(
      (source) => source.domain === domain,
    );
    if (!periodBucket || !knownSource) continue;

    const path =
      typeof rawRow[2] === "string" && rawRow[2].trim() ? rawRow[2] : "/";
    const pathMetrics = rawMetrics(rawRow, 3);
    const sourceMetrics = rawMetrics(rawRow, 11);
    if (pathMetrics.sessions === 0 || sourceMetrics.sessions === 0) continue;

    periodSources.set(`${periodBucket}:${domain}`, sourceMetrics);
    if (periodBucket !== "current") continue;

    const source = currentSources.get(domain) ?? {
      domain,
      label: knownSource.label,
      ...publicMetrics(sourceMetrics, conversionsConfigured),
      landingPages: [],
    };
    source.landingPages.push({
      path,
      ...publicMetrics(pathMetrics, conversionsConfigured),
      trackedCitationCount: 0,
    });
    currentSources.set(domain, source);
  }

  const sources = [...currentSources.values()]
    .map((source) => ({
      ...source,
      landingPages: source.landingPages.sort(
        (left, right) =>
          right.sessions - left.sessions || left.path.localeCompare(right.path),
      ),
    }))
    .sort(
      (left, right) =>
        right.sessions - left.sessions || left.label.localeCompare(right.label),
    );
  const currentRaw = [...periodSources.entries()]
    .filter(([key]) => key.startsWith("current:"))
    .map(([, metrics]) => metrics);
  const previousRaw = [...periodSources.entries()]
    .filter(([key]) => key.startsWith("previous:"))
    .map(([, metrics]) => metrics);

  return {
    totals: publicMetrics(
      aggregateRawMetrics(currentRaw),
      conversionsConfigured,
    ),
    previousPeriod: publicMetrics(
      aggregateRawMetrics(previousRaw),
      conversionsConfigured,
    ),
    sources,
  };
}

function normalizedPath(value: string): string {
  const withoutTrailingSlash =
    value === "/" ? value : value.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
}

export function attachTrackedCitations(
  data: AiReferralsData,
  citationUrls: readonly string[],
): AiReferralsData {
  const citationCounts = new Map<string, number>();
  for (const value of citationUrls) {
    try {
      const url = new URL(value);
      if (normalizeSiteHost(url.origin) !== data.siteHost) continue;
      const path = normalizedPath(url.pathname);
      citationCounts.set(path, (citationCounts.get(path) ?? 0) + 1);
    } catch {
      // Invalid upstream citation URLs cannot be correlated to a landing page.
    }
  }

  let citedLandingPageSessions = 0;
  const matchedPaths = new Set<string>();
  const sources = data.sources.map((source) => ({
    ...source,
    landingPages: source.landingPages.map((page) => {
      const count = citationCounts.get(normalizedPath(page.path)) ?? 0;
      if (count > 0) {
        citedLandingPageSessions += page.sessions;
        matchedPaths.add(normalizedPath(page.path));
      }
      return { ...page, trackedCitationCount: count };
    }),
  }));

  return {
    ...data,
    sources,
    citedLandingPageSessions,
    trackedCitationCount: [...matchedPaths].reduce(
      (total, path) => total + (citationCounts.get(path) ?? 0),
      0,
    ),
  };
}

function postHogApiUrl(host: string, projectId: string): string {
  const parsed = new URL(host);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("POSTHOG_HOST must use http or https");
  }
  parsed.pathname = `/api/projects/${encodeURIComponent(projectId)}/query/`;
  parsed.search = "";
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

export async function fetchPostHogAiReferrals({
  environment,
  website,
  period,
  fetchImpl = fetch,
}: {
  environment: PostHogReferralsEnvironment;
  website: string;
  period: AiReferralPeriod;
  fetchImpl?: typeof fetch;
}): Promise<AiReferralsData> {
  const configuration = postHogReferralsConfiguration(environment);
  if (!configuration.configured) {
    throw new Error(
      `PostHog referrals are not configured: ${configuration.missing.join(", ")}`,
    );
  }

  const host = trimmed(environment.POSTHOG_HOST)!;
  const projectId = trimmed(environment.POSTHOG_PROJECT_ID)!;
  const apiKey = trimmed(environment.POSTHOG_PERSONAL_API_KEY)!;
  const query = buildPostHogAiReferralsQuery({
    website,
    period,
    successEvents: configuration.successEvents,
  });
  const response = await fetchImpl(postHogApiUrl(host, projectId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query },
      name: `openaeo_ai_outcomes_${period}`,
    }),
    signal: AbortSignal.timeout(35_000),
  });
  const payload = (await response
    .json()
    .catch(() => ({}))) as PostHogQueryResponse;
  if (!response.ok) {
    const detail = payload.detail ?? payload.error;
    throw new Error(
      detail
        ? `PostHog query failed (${response.status}): ${detail}`
        : `PostHog query failed (${response.status})`,
    );
  }

  return {
    period,
    siteHost: normalizeSiteHost(website),
    successEvents: configuration.successEvents,
    ...aggregatePostHogAiReferralRows(
      payload.results,
      configuration.successEvents,
    ),
    citedLandingPageSessions: 0,
    trackedCitationCount: 0,
    queriedAt: new Date().toISOString(),
    cached: Boolean(payload.is_cached),
  };
}

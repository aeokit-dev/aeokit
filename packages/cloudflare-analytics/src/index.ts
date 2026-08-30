const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const GRAPHQL_GROUP_LIMIT = 10_000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000;
const TOP_USER_AGENT_LIMIT = 10;
const CLOUDFLARE_REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type CrawlerFamily =
  | "OpenAI"
  | "Anthropic"
  | "Perplexity"
  | "Google"
  | "Bing"
  | "Meta/Facebook"
  | "Apple"
  | "Amazon"
  | "Semrush"
  | "Ahrefs"
  | "MJ12"
  | "Other automated";

const crawlerRules: ReadonlyArray<{
  family: CrawlerFamily;
  pattern: RegExp;
}> = [
  {
    family: "OpenAI",
    pattern: /(?:OAI-SearchBot|ChatGPT-User|GPTBot)/i,
  },
  {
    family: "Anthropic",
    pattern: /(?:ClaudeBot|Claude-SearchBot|Claude-User|anthropic-ai)/i,
  },
  {
    family: "Perplexity",
    pattern: /(?:PerplexityBot|Perplexity-User)/i,
  },
  { family: "Google", pattern: /(?:Googlebot|GoogleOther)/i },
  {
    family: "Bing",
    pattern: /(?:bingbot|BingPreview|MicrosoftPreview)/i,
  },
  {
    family: "Meta/Facebook",
    pattern:
      /(?:facebookexternalhit|FacebookBot|facebookcatalog|Facebot|meta-externalagent|meta-externalfetcher)/i,
  },
  { family: "Apple", pattern: /Applebot/i },
  { family: "Amazon", pattern: /Amazonbot/i },
  { family: "Semrush", pattern: /SemrushBot/i },
  { family: "Ahrefs", pattern: /AhrefsBot/i },
  { family: "MJ12", pattern: /MJ12bot/i },
];

const otherAutomatedPattern =
  /(?:bot(?:[\s/;_+-]|$)|crawler(?:[\s/;_+-]|$)|spider(?:[\s/;_+-]|$)|slurp(?:[\s/;_+-]|$)|Bytespider|Scrapy|HeadlessChrome|PhantomJS|UptimeRobot|Pingdom|StatusCake)/i;

export function classifyCrawlerUserAgent(
  userAgent: string,
): CrawlerFamily | null {
  for (const rule of crawlerRules) {
    if (rule.pattern.test(userAgent)) return rule.family;
  }
  return otherAutomatedPattern.test(userAgent) ? "Other automated" : null;
}

export interface CloudflareRequestGroup {
  count: number;
  dimensions: {
    clientRequestHTTPHost: string;
    userAgent: string;
  };
}

export interface CrawlerTrafficData {
  totalRequests: number;
  identifiedCrawlerRequests: number;
  crawlerSharePercentage: number;
  families: Array<{
    family: CrawlerFamily;
    requests: number;
  }>;
  topUserAgents: Array<{
    userAgent: string;
    family: CrawlerFamily;
    requests: number;
  }>;
  start: string;
  end: string;
}

export interface FirstCrawlerVisit {
  at: string;
  family: CrawlerFamily;
  requests: number;
  source: "cloudflare_http_requests_adaptive_groups";
}

export type CrawlerTrafficDailySnapshot = Omit<
  CrawlerTrafficData,
  "topUserAgents"
> & {
  projectId: string;
  date: string;
};

export interface CrawlerTrafficHistoryStore {
  listProjects(): Promise<Array<{ id: string; website: string }>>;
  listExisting(
    projectIds: string[],
    dates: string[],
  ): Promise<Array<{ projectId: string; date: string }>>;
  save(snapshot: CrawlerTrafficDailySnapshot): Promise<void>;
}

export interface CrawlerTrafficDayWindow {
  date: string;
  start: Date;
  end: Date;
}

export function completedUtcDayWindows(
  now: Date,
  days = 7,
): CrawlerTrafficDayWindow[] {
  if (!Number.isInteger(days) || days < 1 || days > 31) {
    throw new RangeError("Crawler history days must be between 1 and 31");
  }
  const todayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Array.from({ length: days }, (_, index) => {
    const start = new Date(todayStart - (days - index) * DAY_MS);
    return {
      date: start.toISOString().slice(0, 10),
      start,
      end: new Date(start.getTime() + DAY_MS),
    };
  });
}

export async function syncCrawlerTrafficHistory(options: {
  store: CrawlerTrafficHistoryStore;
  client: Pick<CloudflareCrawlerTrafficClient, "getTrafficWindow">;
  token?: string | undefined;
  tokenForProject?: (projectId: string) => Promise<string | undefined>;
  now?: Date;
  days?: number;
}): Promise<{
  configured: boolean;
  imported: number;
  existing: number;
  failed: number;
}> {
  const defaultToken = options.token?.trim() ?? "";
  if (!defaultToken && !options.tokenForProject) {
    return { configured: false, imported: 0, existing: 0, failed: 0 };
  }

  const windows = completedUtcDayWindows(
    options.now ?? new Date(),
    options.days ?? 7,
  );
  const projects = await options.store.listProjects();
  if (projects.length === 0) {
    return { configured: true, imported: 0, existing: 0, failed: 0 };
  }
  const existingRows = await options.store.listExisting(
    projects.map((project) => project.id),
    windows.map((window) => window.date),
  );
  const existingKeys = new Set(
    existingRows.map((row) => `${row.projectId}:${row.date}`),
  );
  let imported = 0;
  let existing = 0;
  let failed = 0;
  let configured = Boolean(defaultToken);

  for (const project of projects) {
    let projectToken = defaultToken;
    if (options.tokenForProject) {
      try {
        projectToken =
          (await options.tokenForProject(project.id))?.trim() ?? defaultToken;
      } catch {
        failed += windows.filter(
          (window) => !existingKeys.has(`${project.id}:${window.date}`),
        ).length;
        continue;
      }
    }
    if (!projectToken) continue;
    configured = true;
    for (const window of windows) {
      const key = `${project.id}:${window.date}`;
      if (existingKeys.has(key)) {
        existing += 1;
        continue;
      }
      try {
        const traffic = await options.client.getTrafficWindow(
          project.website,
          window.start,
          window.end,
          projectToken,
        );
        const { topUserAgents: _topUserAgents, ...dailyAggregate } = traffic;
        await options.store.save({
          projectId: project.id,
          date: window.date,
          ...dailyAggregate,
        });
        existingKeys.add(key);
        imported += 1;
      } catch {
        failed += 1;
      }
    }
  }
  return { configured, imported, existing, failed };
}

function roundedPercentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

export function aggregateCrawlerTraffic(
  groups: CloudflareRequestGroup[],
  totalCount: number | undefined,
  start: Date,
  end: Date,
): CrawlerTrafficData {
  const familyCounts = new Map<CrawlerFamily, number>();
  const userAgentCounts = new Map<
    string,
    { family: CrawlerFamily; requests: number }
  >();
  let identifiedCrawlerRequests = 0;

  for (const group of groups) {
    const count = Math.max(0, Math.trunc(group.count));
    const family = classifyCrawlerUserAgent(group.dimensions.userAgent);
    if (!family || count === 0) continue;
    identifiedCrawlerRequests += count;
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + count);
    const current = userAgentCounts.get(group.dimensions.userAgent);
    userAgentCounts.set(group.dimensions.userAgent, {
      family,
      requests: (current?.requests ?? 0) + count,
    });
  }

  const groupedTotal = groups.reduce(
    (total, group) => total + Math.max(0, Math.trunc(group.count)),
    0,
  );
  const totalRequests = Math.max(
    identifiedCrawlerRequests,
    totalCount === undefined
      ? groupedTotal
      : Math.max(0, Math.trunc(totalCount)),
  );

  return {
    totalRequests,
    identifiedCrawlerRequests,
    crawlerSharePercentage: roundedPercentage(
      identifiedCrawlerRequests,
      totalRequests,
    ),
    families: [...familyCounts.entries()]
      .map(([family, requests]) => ({ family, requests }))
      .sort((left, right) => right.requests - left.requests),
    topUserAgents: [...userAgentCounts.entries()]
      .map(([userAgent, value]) => ({ userAgent, ...value }))
      .sort((left, right) => right.requests - left.requests)
      .slice(0, TOP_USER_AGENT_LIMIT),
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export type CloudflareCrawlerTrafficErrorCode =
  | "cloudflare_not_configured"
  | "cloudflare_zone_not_found"
  | "cloudflare_insufficient_permissions"
  | "cloudflare_graphql_error"
  | "cloudflare_unavailable";

const errorDetails: Record<
  CloudflareCrawlerTrafficErrorCode,
  { message: string; status: 403 | 422 | 502 | 503 }
> = {
  cloudflare_not_configured: {
    message:
      "Cloudflare analytics is not connected. Connect Cloudflare in Settings or configure a server token.",
    status: 503,
  },
  cloudflare_zone_not_found: {
    message:
      "No accessible Cloudflare zone was found for this project's website.",
    status: 422,
  },
  cloudflare_insufficient_permissions: {
    message:
      "The Cloudflare token does not have permission to read this zone's analytics.",
    status: 403,
  },
  cloudflare_graphql_error: {
    message: "Cloudflare returned an analytics query error.",
    status: 502,
  },
  cloudflare_unavailable: {
    message: "Cloudflare crawler analytics is temporarily unavailable.",
    status: 502,
  },
};

export class CloudflareCrawlerTrafficError extends Error {
  readonly status: 403 | 422 | 502 | 503;

  constructor(readonly code: CloudflareCrawlerTrafficErrorCode) {
    const details = errorDetails[code];
    super(details.message);
    this.name = "CloudflareCrawlerTrafficError";
    this.status = details.status;
  }
}

export function publicCrawlerTrafficError(error: unknown): {
  body: { error: string; code: CloudflareCrawlerTrafficErrorCode };
  status: 403 | 422 | 502 | 503;
} {
  if (error instanceof CloudflareCrawlerTrafficError) {
    return {
      body: { error: error.message, code: error.code },
      status: error.status,
    };
  }
  return {
    body: {
      error: "Cloudflare crawler analytics is temporarily unavailable.",
      code: "cloudflare_unavailable",
    },
    status: 502,
  };
}

interface CloudflareApiError {
  code?: number;
  message?: string;
}

interface ZoneListResponse {
  success?: boolean;
  result?: Array<{ id?: string; name?: string }>;
  errors?: CloudflareApiError[];
}

interface GraphqlResponse {
  data?: {
    viewer?: {
      zones?: Array<{
        total?: Array<{ count?: number | string }>;
        groups?: Array<{
          count?: number | string;
          dimensions?: {
            clientRequestHTTPHost?: string;
            userAgent?: string;
          };
        }>;
        pathGroups?: Array<{
          count?: number | string;
          dimensions?: {
            clientRequestPath?: string;
            datetimeHour?: string;
            userAgent?: string;
          };
        }>;
      }>;
    };
  };
  errors?: CloudflareApiError[] | null;
}

const crawlerTrafficQuery = `
  query IdentifiedCrawlerTraffic($zoneTag: string, $filter: filter) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        total: httpRequestsAdaptiveGroups(limit: 1, filter: $filter) {
          count
        }
        groups: httpRequestsAdaptiveGroups(
          limit: ${GRAPHQL_GROUP_LIMIT}
          orderBy: [count_DESC]
          filter: $filter
        ) {
          count
          dimensions {
            clientRequestHTTPHost
            userAgent
          }
        }
      }
    }
  }
`;

const firstCrawlerVisitQuery = `
  query FirstCrawlerVisit($zoneTag: string, $filter: filter) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        pathGroups: httpRequestsAdaptiveGroups(
          limit: ${GRAPHQL_GROUP_LIMIT}
          orderBy: [datetimeHour_ASC]
          filter: $filter
        ) {
          count
          dimensions {
            clientRequestPath
            datetimeHour
            userAgent
          }
        }
      }
    }
  }
`;

function hasPermissionError(
  responseStatus: number,
  errors: CloudflareApiError[] | null | undefined,
): boolean {
  if (responseStatus === 401 || responseStatus === 403) return true;
  return Boolean(
    errors?.some((error) =>
      /(?:permission|not authorized|unauthorized|authentication|access denied|not permitted|does not have access|not entitled|forbidden)/i.test(
        error.message ?? "",
      ),
    ),
  );
}

function countValue(value: number | string | undefined): number | undefined {
  const count = typeof value === "string" ? Number(value) : value;
  return count !== undefined && Number.isFinite(count) && count >= 0
    ? count
    : undefined;
}

function websiteHostname(website: string): string {
  return new URL(website).hostname.toLowerCase().replace(/\.$/, "");
}

function websiteCacheKey(website: string): string {
  return websiteHostname(website).replace(/^www\./, "");
}

export function cloudflareZoneCandidates(website: string): string[] {
  const hostname = websiteHostname(website).replace(/^www\./, "");
  const labels = hostname.split(".").filter(Boolean);
  const candidates: string[] = [];
  while (labels.length >= 2) {
    candidates.push(labels.join("."));
    labels.shift();
  }
  return candidates;
}

interface CloudflareCrawlerTrafficClientOptions {
  token?: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
  cacheTtlMs?: number;
}

export class CloudflareCrawlerTrafficClient {
  private readonly defaultToken: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<
    string,
    { expiresAt: number; data: CrawlerTrafficData }
  >();
  private readonly zoneCache = new Map<
    string,
    { expiresAt: number; zone: { id: string; name: string } }
  >();

  constructor(options: CloudflareCrawlerTrafficClientOptions = {}) {
    this.defaultToken = (options.token ?? "").trim();
    this.fetchFn =
      options.fetchFn ??
      ((input, init) => {
        return globalThis.fetch(input, init);
      });
    this.now = options.now ?? (() => new Date());
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async getTraffic(
    website: string,
    tokenOverride?: string,
  ): Promise<CrawlerTrafficData> {
    const token = (tokenOverride ?? this.defaultToken).trim();
    if (!token) {
      throw new CloudflareCrawlerTrafficError("cloudflare_not_configured");
    }

    let cacheKey: string;
    try {
      cacheKey = websiteCacheKey(website);
    } catch {
      throw new CloudflareCrawlerTrafficError("cloudflare_zone_not_found");
    }
    const requestedAt = this.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > requestedAt.getTime()) return cached.data;

    try {
      const end = requestedAt;
      const start = new Date(end.getTime() - DAY_MS);
      return await this.fetchWindow(website, start, end, token, cacheKey);
    } catch (error) {
      if (error instanceof CloudflareCrawlerTrafficError) throw error;
      throw new CloudflareCrawlerTrafficError("cloudflare_unavailable");
    }
  }

  async getTrafficWindow(
    website: string,
    start: Date,
    end: Date,
    tokenOverride?: string,
  ): Promise<CrawlerTrafficData> {
    const token = (tokenOverride ?? this.defaultToken).trim();
    if (!token) {
      throw new CloudflareCrawlerTrafficError("cloudflare_not_configured");
    }
    const duration = end.getTime() - start.getTime();
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      duration <= 0 ||
      duration > DAY_MS
    ) {
      throw new RangeError(
        "Cloudflare analytics windows must be 24 hours or less",
      );
    }
    let cacheKey: string;
    try {
      cacheKey = `${websiteCacheKey(website)}:${start.toISOString()}:${end.toISOString()}`;
    } catch {
      throw new CloudflareCrawlerTrafficError("cloudflare_zone_not_found");
    }
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now().getTime()) return cached.data;

    try {
      return await this.fetchWindow(website, start, end, token, cacheKey);
    } catch (error) {
      if (error instanceof CloudflareCrawlerTrafficError) throw error;
      throw new CloudflareCrawlerTrafficError("cloudflare_unavailable");
    }
  }

  async getFirstCrawlerVisit(
    website: string,
    pageUrl: string,
    start: Date,
    end: Date,
    tokenOverride?: string,
  ): Promise<FirstCrawlerVisit | null> {
    const token = (tokenOverride ?? this.defaultToken).trim();
    if (!token) {
      throw new CloudflareCrawlerTrafficError("cloudflare_not_configured");
    }
    const duration = end.getTime() - start.getTime();
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      duration <= 0 ||
      duration > 31 * DAY_MS
    ) {
      throw new RangeError(
        "Crawler visit lookup windows must be between zero and 31 days",
      );
    }
    let page: URL;
    try {
      page = new URL(pageUrl);
    } catch {
      throw new CloudflareCrawlerTrafficError("cloudflare_zone_not_found");
    }
    try {
      const zone = await this.resolveZone(website, token);
      const response = await this.fetchFn(`${CLOUDFLARE_API_BASE}/graphql`, {
        method: "POST",
        headers: this.authorizationHeaders(token),
        signal: AbortSignal.timeout(CLOUDFLARE_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          query: firstCrawlerVisitQuery,
          variables: {
            zoneTag: zone.id,
            filter: {
              datetime_geq: start.toISOString(),
              datetime_lt: end.toISOString(),
              requestSource: "eyeball",
              clientRequestHTTPHost_in: [zone.name, `www.${zone.name}`],
              clientRequestPath: page.pathname,
            },
          },
        }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as GraphqlResponse | null;
      if (hasPermissionError(response.status, payload?.errors)) {
        throw new CloudflareCrawlerTrafficError(
          "cloudflare_insufficient_permissions",
        );
      }
      if (!response.ok || !payload || payload.errors?.length) {
        throw new CloudflareCrawlerTrafficError("cloudflare_graphql_error");
      }
      const groups = payload.data?.viewer?.zones?.[0]?.pathGroups;
      if (!Array.isArray(groups)) {
        throw new CloudflareCrawlerTrafficError("cloudflare_graphql_error");
      }
      const visits = groups.flatMap((group) => {
        const count = countValue(group.count);
        const at = group.dimensions?.datetimeHour;
        const family = classifyCrawlerUserAgent(
          group.dimensions?.userAgent ?? "",
        );
        if (!family || count === undefined || !at) return [];
        const timestamp = new Date(at);
        if (!Number.isFinite(timestamp.getTime())) return [];
        return [{ at: timestamp, family, requests: count }];
      });
      visits.sort((left, right) => left.at.getTime() - right.at.getTime());
      const first = visits[0];
      return first
        ? {
            at: first.at.toISOString(),
            family: first.family,
            requests: first.requests,
            source: "cloudflare_http_requests_adaptive_groups",
          }
        : null;
    } catch (error) {
      if (error instanceof CloudflareCrawlerTrafficError) throw error;
      throw new CloudflareCrawlerTrafficError("cloudflare_unavailable");
    }
  }

  private async fetchWindow(
    website: string,
    start: Date,
    end: Date,
    token: string,
    cacheKey: string,
  ): Promise<CrawlerTrafficData> {
    const zone = await this.resolveZone(website, token);
    const data = await this.queryTraffic(zone.id, zone.name, start, end, token);
    this.cache.set(cacheKey, {
      expiresAt: this.now().getTime() + this.cacheTtlMs,
      data,
    });
    return data;
  }

  private authorizationHeaders(token: string): HeadersInit {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private async resolveZone(
    website: string,
    token: string,
  ): Promise<{ id: string; name: string }> {
    const cacheKey = websiteCacheKey(website);
    const cached = this.zoneCache.get(cacheKey);
    const now = this.now().getTime();
    if (cached && cached.expiresAt > now) return cached.zone;

    for (const candidate of cloudflareZoneCandidates(website)) {
      const url = new URL(`${CLOUDFLARE_API_BASE}/zones`);
      url.searchParams.set("name", candidate);
      url.searchParams.set("status", "active");
      url.searchParams.set("match", "all");
      url.searchParams.set("per_page", "1");
      const response = await this.fetchFn(url, {
        headers: this.authorizationHeaders(token),
        signal: AbortSignal.timeout(CLOUDFLARE_REQUEST_TIMEOUT_MS),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as ZoneListResponse | null;
      if (hasPermissionError(response.status, payload?.errors)) {
        throw new CloudflareCrawlerTrafficError(
          "cloudflare_insufficient_permissions",
        );
      }
      if (!response.ok || !payload?.success) {
        throw new CloudflareCrawlerTrafficError("cloudflare_unavailable");
      }
      const zone = payload.result?.find(
        (item) => item.name?.toLowerCase() === candidate,
      );
      if (zone?.id && zone.name) {
        const resolved = { id: zone.id, name: zone.name };
        this.zoneCache.set(cacheKey, {
          expiresAt: now + this.cacheTtlMs,
          zone: resolved,
        });
        return resolved;
      }
    }
    throw new CloudflareCrawlerTrafficError("cloudflare_zone_not_found");
  }

  private async queryTraffic(
    zoneId: string,
    zoneName: string,
    start: Date,
    end: Date,
    token: string,
  ): Promise<CrawlerTrafficData> {
    const response = await this.fetchFn(`${CLOUDFLARE_API_BASE}/graphql`, {
      method: "POST",
      headers: this.authorizationHeaders(token),
      signal: AbortSignal.timeout(CLOUDFLARE_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        query: crawlerTrafficQuery,
        variables: {
          zoneTag: zoneId,
          filter: {
            datetime_geq: start.toISOString(),
            datetime_lt: end.toISOString(),
            requestSource: "eyeball",
            clientRequestHTTPHost_in: [zoneName, `www.${zoneName}`],
          },
        },
      }),
    });
    const payload = (await response
      .json()
      .catch(() => null)) as GraphqlResponse | null;
    if (hasPermissionError(response.status, payload?.errors)) {
      throw new CloudflareCrawlerTrafficError(
        "cloudflare_insufficient_permissions",
      );
    }
    if (!response.ok || !payload) {
      throw new CloudflareCrawlerTrafficError("cloudflare_unavailable");
    }
    if (payload.errors?.length) {
      throw new CloudflareCrawlerTrafficError("cloudflare_graphql_error");
    }
    const zone = payload.data?.viewer?.zones?.[0];
    if (!zone) {
      throw new CloudflareCrawlerTrafficError(
        "cloudflare_insufficient_permissions",
      );
    }

    const totalCount = countValue(zone.total?.[0]?.count);
    if (totalCount === undefined || !Array.isArray(zone.groups)) {
      throw new CloudflareCrawlerTrafficError("cloudflare_graphql_error");
    }

    const groups: CloudflareRequestGroup[] = [];
    for (const group of zone.groups) {
      const count = countValue(group.count);
      const hostname = group.dimensions?.clientRequestHTTPHost;
      const userAgent = group.dimensions?.userAgent;
      if (count === undefined || !hostname || typeof userAgent !== "string") {
        continue;
      }
      groups.push({
        count,
        dimensions: {
          clientRequestHTTPHost: hostname,
          userAgent,
        },
      });
    }
    return aggregateCrawlerTraffic(groups, totalCount, start, end);
  }
}

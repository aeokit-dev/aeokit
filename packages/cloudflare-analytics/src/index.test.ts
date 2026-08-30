import { describe, expect, it, vi } from "vitest";
import {
  CloudflareCrawlerTrafficClient,
  CloudflareCrawlerTrafficError,
  aggregateCrawlerTraffic,
  classifyCrawlerUserAgent,
  cloudflareZoneCandidates,
  completedUtcDayWindows,
  syncCrawlerTrafficHistory,
  type CrawlerTrafficDailySnapshot,
} from "./index.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("classifyCrawlerUserAgent", () => {
  it.each([
    ["Mozilla/5.0 (compatible; OAI-SearchBot/1.0)", "OpenAI"],
    ["ChatGPT-User/1.0", "OpenAI"],
    ["GPTBot/1.2", "OpenAI"],
    ["ClaudeBot/1.0", "Anthropic"],
    ["Claude-SearchBot/1.0", "Anthropic"],
    ["anthropic-ai", "Anthropic"],
    ["PerplexityBot/1.0", "Perplexity"],
    ["Googlebot/2.1", "Google"],
    ["GoogleOther", "Google"],
    ["bingbot/2.0", "Bing"],
    ["facebookexternalhit/1.1", "Meta/Facebook"],
    ["FacebookBot/1.0", "Meta/Facebook"],
    ["meta-externalagent/1.1", "Meta/Facebook"],
    ["Applebot-Extended/1.0", "Apple"],
    ["Amazonbot/0.1", "Amazon"],
    ["SemrushBot/7~bl", "Semrush"],
    ["AhrefsBot/7.0", "Ahrefs"],
    ["MJ12bot/v1.4", "MJ12"],
    ["ExampleCrawler/1.0", "Other automated"],
    ["Mozilla/5.0 HeadlessChrome/120.0", "Other automated"],
  ])("classifies %s as %s", (userAgent, family) => {
    expect(classifyCrawlerUserAgent(userAgent)).toBe(family);
  });

  it("does not call an ordinary browser a crawler", () => {
    expect(
      classifyCrawlerUserAgent(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
      ),
    ).toBeNull();
  });
});

describe("aggregateCrawlerTraffic", () => {
  it("aggregates families and user agents and calculates crawler share", () => {
    const start = new Date("2026-08-25T12:00:00.000Z");
    const end = new Date("2026-08-26T12:00:00.000Z");
    const result = aggregateCrawlerTraffic(
      [
        {
          count: 10,
          dimensions: {
            clientRequestHTTPHost: "example.com",
            userAgent: "GPTBot/1.2",
          },
        },
        {
          count: 5,
          dimensions: {
            clientRequestHTTPHost: "www.example.com",
            userAgent: "GPTBot/1.2",
          },
        },
        {
          count: 8,
          dimensions: {
            clientRequestHTTPHost: "example.com",
            userAgent: "ClaudeBot/1.0",
          },
        },
        {
          count: 77,
          dimensions: {
            clientRequestHTTPHost: "example.com",
            userAgent: "Mozilla/5.0 Chrome/126.0",
          },
        },
      ],
      100,
      start,
      end,
    );

    expect(result).toMatchObject({
      totalRequests: 100,
      identifiedCrawlerRequests: 23,
      crawlerSharePercentage: 23,
      families: [
        { family: "OpenAI", requests: 15 },
        { family: "Anthropic", requests: 8 },
      ],
      start: start.toISOString(),
      end: end.toISOString(),
    });
    expect(result.topUserAgents[0]).toEqual({
      userAgent: "GPTBot/1.2",
      family: "OpenAI",
      requests: 15,
    });
  });

  it("returns zero percentages for empty data", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    expect(aggregateCrawlerTraffic([], 0, now, now)).toMatchObject({
      totalRequests: 0,
      identifiedCrawlerRequests: 0,
      crawlerSharePercentage: 0,
      families: [],
      topUserAgents: [],
    });
  });
});

describe("crawler traffic history", () => {
  it("builds the seven most recent completed UTC day windows", () => {
    const windows = completedUtcDayWindows(
      new Date("2026-08-26T17:42:00.000Z"),
    );
    expect(windows.map((window) => window.date)).toEqual([
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
    ]);
    expect(
      windows.every(
        (window) =>
          window.end.getTime() - window.start.getTime() === 86_400_000,
      ),
    ).toBe(true);
  });

  it("backfills missing daily aggregates idempotently", async () => {
    const saved: CrawlerTrafficDailySnapshot[] = [];
    const getTrafficWindow = vi.fn(
      async (_website: string, start: Date, end: Date) => ({
        totalRequests: 100,
        identifiedCrawlerRequests: 10,
        crawlerSharePercentage: 10,
        families: [{ family: "OpenAI" as const, requests: 10 }],
        topUserAgents: [],
        start: start.toISOString(),
        end: end.toISOString(),
      }),
    );
    const result = await syncCrawlerTrafficHistory({
      token: "server-token",
      now: new Date("2026-08-26T17:42:00.000Z"),
      client: { getTrafficWindow },
      store: {
        listProjects: async () => [
          { id: "project-1", website: "https://www.example.com" },
        ],
        listExisting: async () => [
          { projectId: "project-1", date: "2026-08-20" },
        ],
        save: async (snapshot) => {
          saved.push(snapshot);
        },
      },
    });

    expect(result).toEqual({
      configured: true,
      imported: 6,
      existing: 1,
      failed: 0,
    });
    expect(saved.map((snapshot) => snapshot.date)).toEqual([
      "2026-08-19",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
    ]);
    expect(saved.every((snapshot) => !("topUserAgents" in snapshot))).toBe(
      true,
    );
    expect(getTrafficWindow).toHaveBeenCalledTimes(6);
  });

  it("does no database or network work without a token", async () => {
    const listProjects = vi.fn();
    const getTrafficWindow = vi.fn();
    await expect(
      syncCrawlerTrafficHistory({
        token: "",
        client: { getTrafficWindow },
        store: {
          listProjects,
          listExisting: vi.fn(),
          save: vi.fn(),
        },
      }),
    ).resolves.toEqual({
      configured: false,
      imported: 0,
      existing: 0,
      failed: 0,
    });
    expect(listProjects).not.toHaveBeenCalled();
    expect(getTrafficWindow).not.toHaveBeenCalled();
  });

  it("uses a separate token for each connected project", async () => {
    const getTrafficWindow = vi.fn(async (_website, start, end, _token) => ({
      totalRequests: 0,
      identifiedCrawlerRequests: 0,
      crawlerSharePercentage: 0,
      families: [],
      topUserAgents: [],
      start: start.toISOString(),
      end: end.toISOString(),
    }));
    const tokenForProject = vi.fn(async (projectId: string) =>
      projectId === "connected" ? "tenant-token" : undefined,
    );
    const result = await syncCrawlerTrafficHistory({
      tokenForProject,
      days: 1,
      now: new Date("2026-08-26T12:00:00.000Z"),
      client: { getTrafficWindow },
      store: {
        listProjects: async () => [
          { id: "connected", website: "https://a.example" },
          { id: "not-connected", website: "https://b.example" },
        ],
        listExisting: async () => [],
        save: vi.fn(),
      },
    });

    expect(result).toEqual({
      configured: true,
      imported: 1,
      existing: 0,
      failed: 0,
    });
    expect(tokenForProject).toHaveBeenCalledTimes(2);
    expect(getTrafficWindow).toHaveBeenCalledWith(
      "https://a.example",
      expect.any(Date),
      expect.any(Date),
      "tenant-token",
    );
    expect(getTrafficWindow).toHaveBeenCalledTimes(1);
  });

  it("continues importing other days when one Cloudflare window fails", async () => {
    let attempt = 0;
    const save = vi.fn();
    const result = await syncCrawlerTrafficHistory({
      token: "server-token",
      now: new Date("2026-08-26T12:00:00.000Z"),
      client: {
        getTrafficWindow: vi.fn(async (_website, start, end) => {
          attempt += 1;
          if (attempt === 1) throw new Error("temporary failure");
          return {
            totalRequests: 0,
            identifiedCrawlerRequests: 0,
            crawlerSharePercentage: 0,
            families: [],
            topUserAgents: [],
            start: start.toISOString(),
            end: end.toISOString(),
          };
        }),
      },
      store: {
        listProjects: async () => [
          { id: "project-1", website: "https://example.com" },
        ],
        listExisting: async () => [],
        save,
      },
    });
    expect(result).toEqual({
      configured: true,
      imported: 6,
      existing: 0,
      failed: 1,
    });
    expect(save).toHaveBeenCalledTimes(6);
  });
});

describe("CloudflareCrawlerTrafficClient", () => {
  it("preserves the Worker global receiver for the default fetch", async () => {
    const responses = [
      jsonResponse({
        success: true,
        result: [{ id: "zone-123", name: "example.com" }],
        errors: [],
      }),
      jsonResponse({
        data: {
          viewer: { zones: [{ total: [{ count: 0 }], groups: [] }] },
        },
        errors: null,
      }),
    ];
    const receiverSensitiveFetch = vi.fn(function (
      this: unknown,
    ): Promise<Response> {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      const response = responses.shift();
      if (!response) throw new Error("Unexpected fetch");
      return Promise.resolve(response);
    });
    vi.stubGlobal("fetch", receiverSensitiveFetch);

    try {
      await expect(
        new CloudflareCrawlerTrafficClient({
          token: "server-secret",
        }).getTraffic("https://example.com"),
      ).resolves.toMatchObject({ totalRequests: 0 });
      expect(receiverSensitiveFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("resolves apex/www projects to the same zone candidates", () => {
    expect(cloudflareZoneCandidates("https://www.example.com/path")).toEqual([
      "example.com",
    ]);
    expect(cloudflareZoneCandidates("https://news.example.co.uk")).toEqual([
      "news.example.co.uk",
      "example.co.uk",
      "co.uk",
    ]);
  });

  it("queries only aggregate crawler fields for the rolling window and caches success", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        result: [{ id: "zone-123", name: "example.com" }],
        errors: [],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          viewer: {
            zones: [
              {
                total: [{ count: 120 }],
                groups: [
                  {
                    count: 12,
                    dimensions: {
                      clientRequestHTTPHost: "example.com",
                      userAgent: "GPTBot/1.2",
                    },
                  },
                ],
              },
            ],
          },
        },
        errors: null,
      }),
    );
    const client = new CloudflareCrawlerTrafficClient({
      fetchFn: fetchMock,
      now: () => new Date("2026-08-26T12:00:00.000Z"),
    });

    const first = await client.getTraffic(
      "https://www.example.com/about",
      "server-secret",
    );
    const second = await client.getTraffic(
      "https://example.com",
      "server-secret",
    );

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer server-secret",
    });
    const graphqlCall = fetchMock.mock.calls[1];
    expect(graphqlCall).toBeDefined();
    const init = graphqlCall?.[1];
    const body = JSON.parse(String(init?.body)) as {
      query: string;
      variables: {
        filter: Record<string, unknown>;
      };
    };
    expect(body.variables.filter).toEqual({
      datetime_geq: "2026-08-25T12:00:00.000Z",
      datetime_lt: "2026-08-26T12:00:00.000Z",
      requestSource: "eyeball",
      clientRequestHTTPHost_in: ["example.com", "www.example.com"],
    });
    expect(body.query).toContain("httpRequestsAdaptiveGroups");
    expect(body.query).toContain("clientRequestHTTPHost");
    expect(body.query).toContain("userAgent");
    expect(body.query).not.toMatch(
      /clientIP|clientCountry|clientRequestURI|referer/i,
    );
    expect(first).toMatchObject({
      totalRequests: 120,
      identifiedCrawlerRequests: 12,
      crawlerSharePercentage: 10,
    });
  });

  it("handles missing configuration and empty Cloudflare data", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const unconfigured = new CloudflareCrawlerTrafficClient({
      token: "",
      fetchFn: fetchMock,
    });
    await expect(
      unconfigured.getTraffic("https://example.com"),
    ).rejects.toMatchObject({ code: "cloudflare_not_configured", status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        result: [{ id: "zone-123", name: "example.com" }],
        errors: [],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          viewer: { zones: [{ total: [{ count: 0 }], groups: [] }] },
        },
        errors: null,
      }),
    );
    const configured = new CloudflareCrawlerTrafficClient({
      token: "server-secret",
      fetchFn: fetchMock,
      now: () => new Date("2026-08-26T12:00:00.000Z"),
    });
    await expect(
      configured.getTraffic("https://example.com"),
    ).resolves.toMatchObject({
      totalRequests: 0,
      identifiedCrawlerRequests: 0,
      families: [],
    });
  });

  it("queries explicit closed-day windows without widening them", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        result: [{ id: "zone-123", name: "example.com" }],
        errors: [],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          viewer: { zones: [{ total: [{ count: 0 }], groups: [] }] },
        },
        errors: null,
      }),
    );
    const client = new CloudflareCrawlerTrafficClient({ fetchFn: fetchMock });
    await client.getTrafficWindow(
      "https://example.com",
      new Date("2026-08-24T00:00:00.000Z"),
      new Date("2026-08-25T00:00:00.000Z"),
      "server-token",
    );
    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      variables: { filter: Record<string, unknown> };
    };
    expect(body.variables.filter).toMatchObject({
      datetime_geq: "2026-08-24T00:00:00.000Z",
      datetime_lt: "2026-08-25T00:00:00.000Z",
    });
  });

  it("maps zone, permission, and GraphQL failures without exposing secrets", async () => {
    const zoneFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ success: true, result: [], errors: [] }),
      );
    await expect(
      new CloudflareCrawlerTrafficClient({
        token: "secret-zone-token",
        fetchFn: zoneFetch,
      }).getTraffic("https://example.com"),
    ).rejects.toMatchObject({ code: "cloudflare_zone_not_found", status: 422 });

    const permissionFetch = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          success: false,
          errors: [{ message: "denied secret-permission-token" }],
        },
        403,
      ),
    );
    const permissionError = await new CloudflareCrawlerTrafficClient({
      token: "secret-permission-token",
      fetchFn: permissionFetch,
    })
      .getTraffic("https://example.com")
      .catch((error: unknown) => error);
    expect(permissionError).toBeInstanceOf(CloudflareCrawlerTrafficError);
    expect(permissionError).toMatchObject({
      code: "cloudflare_insufficient_permissions",
      status: 403,
    });
    expect(String(permissionError)).not.toContain("secret-permission-token");

    const graphqlFetch = vi.fn<typeof fetch>();
    graphqlFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        result: [{ id: "zone-123", name: "example.com" }],
        errors: [],
      }),
    );
    graphqlFetch.mockResolvedValueOnce(
      jsonResponse({ errors: [{ message: "query cannot be executed" }] }),
    );
    await expect(
      new CloudflareCrawlerTrafficClient({
        token: "secret-graphql-token",
        fetchFn: graphqlFetch,
      }).getTraffic("https://example.com"),
    ).rejects.toMatchObject({ code: "cloudflare_graphql_error", status: 502 });
  });
});

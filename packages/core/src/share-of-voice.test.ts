import { describe, expect, it } from "vitest";
import { buildShareOfVoiceReport } from "./share-of-voice.js";

const surfaces = [
  { provider: "brightdata", model: "chatgpt" },
  { provider: "dataforseo", model: "perplexity" },
  { provider: "dataforseo", model: "google-ai-mode" },
];

const prompts = [
  {
    id: "best-mac",
    value: "Where should I buy a refurbished Mac?",
    tags: ["Refurbished Macs"],
  },
  {
    id: "stock-alerts",
    value: "Which sites offer Mac stock alerts?",
    tags: ["Stock alerts"],
  },
];

const runs = [
  {
    id: "previous-chatgpt",
    promptId: "best-mac",
    createdAt: "2026-07-20T12:00:00.000Z",
    provider: "brightdata",
    model: "chatgpt",
    status: "succeeded" as const,
    brandMentioned: false,
    competitorsMentioned: ["Back Market"],
  },
  {
    id: "current-chatgpt",
    promptId: "best-mac",
    createdAt: "2026-08-10T12:00:00.000Z",
    provider: "brightdata",
    model: "chatgpt",
    status: "succeeded" as const,
    brandMentioned: true,
    competitorsMentioned: ["Back Market"],
  },
  {
    id: "current-perplexity-loss",
    promptId: "stock-alerts",
    createdAt: "2026-08-11T12:00:00.000Z",
    provider: "dataforseo",
    model: "perplexity",
    status: "succeeded" as const,
    brandMentioned: false,
    competitorsMentioned: ["Back Market"],
  },
  {
    id: "current-google-failure",
    promptId: "stock-alerts",
    createdAt: "2026-08-12T12:00:00.000Z",
    provider: "dataforseo",
    model: "google-ai-mode",
    status: "failed" as const,
    brandMentioned: false,
    competitorsMentioned: [],
  },
  {
    id: "current-claude",
    promptId: "best-mac",
    createdAt: "2026-08-13T12:00:00.000Z",
    provider: "anthropic",
    model: "claude-sonnet-4",
    status: "succeeded" as const,
    brandMentioned: true,
    competitorsMentioned: [],
  },
];

const citations = [
  {
    runId: "current-chatgpt",
    url: "https://macspotter.com/refurbished",
    domain: "macspotter.com",
    title: "Refurbished Macs",
    category: "owned" as const,
    competitorName: null,
  },
  {
    runId: "current-perplexity-loss",
    url: "https://backmarket.com/macbook",
    domain: "backmarket.com",
    title: "MacBooks",
    category: "competitor" as const,
    competitorName: "Back Market",
  },
  {
    runId: "current-perplexity-loss",
    url: "https://reddit.com/r/mac/deals",
    domain: "reddit.com",
    title: "Mac deals",
    category: "social" as const,
    competitorName: null,
  },
];

describe("share-of-voice report", () => {
  it("joins trend, engines, prompt categories, confidence, citations, gaps, and opportunities", () => {
    const report = buildShareOfVoiceReport({
      brandName: "MacSpotter",
      prompts,
      runs,
      citations,
      surfaces,
      currentStart: "2026-08-01T00:00:00.000Z",
      currentEnd: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-01T00:00:00.000Z",
    });

    expect(report.overview).toMatchObject({
      share: 50,
      previousShare: 0,
      change: 50,
      mentions: 2,
      totalMentions: 4,
    });
    expect(report.trend).toEqual([
      { date: "2026-08-10", share: 50, mentions: 1, totalMentions: 2 },
      { date: "2026-08-11", share: 0, mentions: 0, totalMentions: 1 },
      { date: "2026-08-13", share: 100, mentions: 1, totalMentions: 1 },
    ]);
    expect(report.engines).toEqual([
      {
        engine: "ChatGPT",
        provider: "brightdata",
        model: "chatgpt",
        providerLabel: "Bright Data",
        configured: true,
        successfulRuns: 1,
        failedRuns: 0,
        mentions: 1,
        totalMentions: 2,
        share: 50,
      },
      {
        engine: "Google AI Mode",
        provider: "dataforseo",
        model: "google-ai-mode",
        providerLabel: "DataForSEO",
        configured: true,
        successfulRuns: 0,
        failedRuns: 1,
        mentions: 0,
        totalMentions: 0,
        share: 0,
      },
      {
        engine: "Perplexity",
        provider: "dataforseo",
        model: "perplexity",
        providerLabel: "DataForSEO",
        configured: true,
        successfulRuns: 1,
        failedRuns: 0,
        mentions: 0,
        totalMentions: 1,
        share: 0,
      },
      {
        engine: "Claude",
        provider: "anthropic",
        model: "claude-sonnet-4",
        providerLabel: "Anthropic",
        configured: false,
        successfulRuns: 1,
        failedRuns: 0,
        mentions: 1,
        totalMentions: 1,
        share: 100,
      },
    ]);
    expect(report.confidence).toMatchObject({
      successfulRuns: 3,
      failedRuns: 1,
      completionRate: 75,
      level: "low",
    });
    expect(report.categories).toEqual([
      {
        category: "Refurbished Macs",
        prompts: 1,
        successfulRuns: 2,
        mentions: 2,
        totalMentions: 3,
        share: 67,
      },
      {
        category: "Stock alerts",
        prompts: 1,
        successfulRuns: 1,
        mentions: 0,
        totalMentions: 1,
        share: 0,
      },
    ]);
    expect(report.prompts[1]).toMatchObject({
      promptId: "stock-alerts",
      category: "Stock alerts",
      share: 0,
      leader: "Back Market",
      gap: 100,
    });
    expect(report.citationOwnership).toMatchObject({
      total: 3,
      owned: 1,
      competitor: 1,
      thirdParty: 1,
      ownedShare: 33,
    });
    expect(report.citationOwnership.ownedPages[0]).toMatchObject({
      url: "https://macspotter.com/refurbished",
      citations: 1,
    });
    expect(report.competitorGaps[0]).toMatchObject({
      competitor: "Back Market",
      losses: 1,
      category: "Stock alerts",
      engine: "Perplexity",
      competitorCitations: 1,
      thirdPartyCitations: 1,
    });
  });
  it("reports one row per configured surface without inventing untracked engines", () => {
    const trackedSurfaces = [
      "chatgpt",
      "perplexity",
      "gemini",
      "google-ai-mode",
      "google-ai-overview",
      "bing-copilot",
    ].map((model) => ({ provider: "brightdata", model }));
    const surfaceRuns = trackedSurfaces.map((surface, index) => ({
      id: `run-${surface.model}`,
      promptId: "best-mac",
      createdAt: "2026-08-10T12:00:00.000Z",
      provider: surface.provider,
      model: surface.model,
      status: (surface.model === "perplexity" ? "failed" : "succeeded") as
        "succeeded" | "failed",
      brandMentioned: index % 2 === 0,
      competitorsMentioned: [] as string[],
    }));

    const report = buildShareOfVoiceReport({
      brandName: "MacSpotter",
      prompts,
      runs: surfaceRuns,
      citations: [],
      surfaces: trackedSurfaces,
      currentStart: "2026-08-01T00:00:00.000Z",
      currentEnd: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-01T00:00:00.000Z",
    });

    expect(report.engines.map((engine) => engine.engine)).toEqual([
      "ChatGPT",
      "Perplexity",
      "Gemini",
      "Google AI Mode",
      "Google AI Overview",
      "Bing Copilot",
    ]);
    expect(report.engines.every((engine) => engine.configured)).toBe(true);
    expect(report.engines).toContainEqual(
      expect.objectContaining({
        engine: "Bing Copilot",
        provider: "brightdata",
        model: "bing-copilot",
        providerLabel: "Bright Data",
        successfulRuns: 1,
      }),
    );
  });

  it("keeps rows for surfaces that produced runs but are no longer configured", () => {
    const report = buildShareOfVoiceReport({
      brandName: "MacSpotter",
      prompts,
      runs,
      citations,
      surfaces: [{ provider: "brightdata", model: "chatgpt" }],
      currentStart: "2026-08-01T00:00:00.000Z",
      currentEnd: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-01T00:00:00.000Z",
    });

    expect(
      report.engines.map((engine) => [engine.engine, engine.configured]),
    ).toEqual([
      ["ChatGPT", true],
      ["Google AI Mode", false],
      ["Perplexity", false],
      ["Claude", false],
    ]);
  });
  it("labels vendor-prefixed OpenRouter model ids by their model family", () => {
    const openRouterRuns = [
      {
        id: "openrouter-claude",
        promptId: "best-mac",
        createdAt: "2026-08-10T12:00:00.000Z",
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4",
        status: "succeeded" as const,
        brandMentioned: true,
        competitorsMentioned: [] as string[],
      },
      {
        id: "openrouter-gemini",
        promptId: "best-mac",
        createdAt: "2026-08-10T12:00:00.000Z",
        provider: "openrouter",
        model: "google/gemini-2.5-pro",
        status: "succeeded" as const,
        brandMentioned: false,
        competitorsMentioned: ["Back Market"],
      },
    ];

    const report = buildShareOfVoiceReport({
      brandName: "MacSpotter",
      prompts,
      runs: openRouterRuns,
      citations: [],
      surfaces: openRouterRuns.map((run) => ({
        provider: run.provider,
        model: run.model,
      })),
      currentStart: "2026-08-01T00:00:00.000Z",
      currentEnd: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-01T00:00:00.000Z",
    });

    expect(report.engines.map((engine) => engine.engine)).toEqual([
      "Claude",
      "Gemini",
    ]);
    expect(report.engines.every((engine) => engine.configured)).toBe(true);
  });

  it("treats an unsupplied surface list as unknown rather than deconfigured", () => {
    const report = buildShareOfVoiceReport({
      brandName: "MacSpotter",
      prompts,
      runs,
      citations,
      currentStart: "2026-08-01T00:00:00.000Z",
      currentEnd: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-01T00:00:00.000Z",
    });

    expect(report.engines.length).toBeGreaterThan(0);
    expect(report.engines.every((engine) => engine.configured)).toBe(true);
  });

  it("keeps competitor gaps attributable to the provider that ran them", () => {
    const report = buildShareOfVoiceReport({
      brandName: "MacSpotter",
      prompts,
      runs,
      citations,
      surfaces,
      currentStart: "2026-08-01T00:00:00.000Z",
      currentEnd: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-01T00:00:00.000Z",
    });

    expect(report.competitorGaps[0]).toMatchObject({
      engine: "Perplexity",
      engineProvider: "DataForSEO",
    });
    expect(report.competitorGaps[0]?.reason).toContain(
      "on Perplexity via DataForSEO",
    );
  });

  it("orders surfaces the way the provider adapters declare them", () => {
    const trackedSurfaces = [
      "bing-copilot",
      "google-ai-overview",
      "chatgpt",
    ].map((model) => ({ provider: "brightdata", model }));

    const report = buildShareOfVoiceReport({
      brandName: "MacSpotter",
      prompts,
      runs: [],
      citations: [],
      surfaces: trackedSurfaces,
      currentStart: "2026-08-01T00:00:00.000Z",
      currentEnd: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-01T00:00:00.000Z",
    });

    expect(report.engines.map((engine) => engine.engine)).toEqual([
      "ChatGPT",
      "Google AI Overview",
      "Bing Copilot",
    ]);
  });
  it("reports no previous share when the prior window measured nothing", () => {
    const report = buildShareOfVoiceReport({
      brandName: "MacSpotter",
      prompts,
      // Every run sits inside the current window.
      runs: runs.filter((run) => run.id !== "previous-chatgpt"),
      citations,
      surfaces,
      currentStart: "2026-08-01T00:00:00.000Z",
      currentEnd: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-01T00:00:00.000Z",
    });

    // A window with nothing measured has an undefined share, not 0%, and the
    // difference against it is not a movement to report.
    expect(report.overview.previousShare).toBeNull();
    expect(report.overview.change).toBeNull();
    expect(report.overview.share).toBeGreaterThan(0);
  });

  it("still reports a measured zero in the prior window as a real comparison", () => {
    const report = buildShareOfVoiceReport({
      brandName: "MacSpotter",
      prompts,
      runs,
      citations,
      surfaces,
      currentStart: "2026-08-01T00:00:00.000Z",
      currentEnd: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-01T00:00:00.000Z",
    });

    // The prior window has a successful run that did not mention the brand.
    // That is a genuine 0%, and must stay distinguishable from "no data".
    expect(report.overview.previousShare).toBe(0);
    expect(report.overview.change).toBe(50);
  });

  it("treats a prior window of only failed runs as unmeasured", () => {
    const failedPrevious = runs.map((run) =>
      run.id === "previous-chatgpt"
        ? { ...run, status: "failed" as const }
        : run,
    );
    const report = buildShareOfVoiceReport({
      brandName: "MacSpotter",
      prompts,
      runs: failedPrevious,
      citations,
      surfaces,
      currentStart: "2026-08-01T00:00:00.000Z",
      currentEnd: "2026-09-01T00:00:00.000Z",
      previousStart: "2026-07-01T00:00:00.000Z",
    });

    expect(report.overview.previousShare).toBeNull();
    expect(report.overview.change).toBeNull();
  });
});

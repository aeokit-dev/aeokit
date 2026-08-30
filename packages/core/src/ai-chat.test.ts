import { describe, expect, it } from "vitest";
import {
  aiChatTitle,
  buildAiChatMetrics,
  buildAiChatSystemPrompt,
  validateAiChatUiActions,
} from "./ai-chat";

const emptyContext = {
  project: {
    name: "Acme",
    website: "https://acme.example",
    aliases: [] as string[],
    additionalDomains: [] as string[],
  },
  ...buildAiChatMetrics({
    periodDays: 30,
    runs: [],
    targets: [],
    promptTags: [],
  }),
  competitors: [],
  pendingCompetitors: [],
  trackedPrompts: [],
  recentRunsSample: { sampleSize: 0, totalSuccessfulRuns: 0, runs: [] },
};

describe("AI chat helpers", () => {
  it("creates a compact title from the first message", () => {
    expect(aiChatTitle("  How   can I improve my citations?  ")).toBe(
      "How can I improve my citations?",
    );
    expect(aiChatTitle("x".repeat(80))).toBe(`${"x".repeat(51)}…`);
  });

  it("labels project data as untrusted context", () => {
    const prompt = buildAiChatSystemPrompt(emptyContext);

    expect(prompt).toContain("untrusted reference data");
    expect(prompt).toContain('"name": "Acme"');
  });
});

describe("AI chat UI actions", () => {
  const uiContext = {
    route: "/app/brands/project-a",
    page: "Dashboard",
    insights: [
      {
        id: "dashboard-mention-rate",
        label: "Mention rate",
        text: "Mention rate 24%",
      },
    ],
  };

  it("only accepts read-only actions for insight ids in this request", () => {
    expect(
      validateAiChatUiActions(
        [
          { type: "show_ui_insight", insightId: "dashboard-mention-rate" },
          { type: "show_ui_insight", insightId: "dashboard-secret" },
          { type: "open_app_page", page: "prompts", executeImmediately: true },
          { type: "open_app_page", page: "admin" },
          { type: "run_javascript", code: "alert(1)" },
        ],
        uiContext,
      ),
    ).toEqual([
      {
        type: "show_ui_insight",
        insightId: "dashboard-mention-rate",
        label: "Mention rate",
      },
      {
        type: "open_app_page",
        page: "prompts",
        label: "Prompts",
        executeImmediately: true,
      },
    ]);
  });

  it("labels visible UI evidence separately from project and web evidence", () => {
    const prompt = buildAiChatSystemPrompt(
      { ...emptyContext, project: { ...emptyContext.project, name: "A" } },
      uiContext,
    );
    expect(prompt).toContain("Visible UI evidence");
    expect(prompt).toContain("External web research");
    expect(prompt).toContain("Inference");
    expect(prompt).toContain("dashboard-mention-rate");
  });

  it("explains the current-page UI tools without claiming unrestricted browsing", () => {
    const prompt = buildAiChatSystemPrompt(
      { ...emptyContext, project: { ...emptyContext.project, name: "A" } },
      uiContext,
    );

    expect(prompt).toContain("inspect the supplied current-page UI evidence");
    expect(prompt).toContain("list_ui_insights");
    expect(prompt).toContain("show_ui_insight");
    expect(prompt).toContain("open_app_page");
    expect(prompt).toContain("the app will navigate automatically");
    expect(prompt).toContain("Do not say that you cannot inspect the app");
  });

  it("requires concise PostHog-style sections without leaking evidence mechanics", () => {
    const prompt = buildAiChatSystemPrompt({
      ...emptyContext,
      project: { ...emptyContext.project, name: "A" },
    });
    expect(prompt).toContain("Lead with the direct answer");
    expect(prompt).toContain("2–4 short sections");
    expect(prompt).toContain(
      "Do not expose the evidence-class names as headings",
    );
    expect(prompt).toContain("Never invent bracketed pseudo-citations");
    expect(prompt).toContain("Do not browse for generic background material");
    expect(prompt).toContain("one useful next step");
  });
});

describe("AI chat grounding context", () => {
  const runs = [
    ...Array.from({ length: 15 }, (_, index) => ({
      provider: "brightdata",
      model: index < 6 ? "chatgpt" : "gemini",
      status: "succeeded" as const,
      brandMentioned: index < 10,
    })),
    ...Array.from({ length: 3 }, () => ({
      provider: "brightdata",
      model: "perplexity",
      status: "failed" as const,
      brandMentioned: false,
    })),
  ];
  const targets = ["chatgpt", "gemini", "perplexity"].map((model) => ({
    provider: "brightdata",
    model,
  }));

  it("aggregates over every run in the period, not just successful ones", () => {
    const { metrics } = buildAiChatMetrics({
      periodDays: 30,
      runs,
      targets,
      promptTags: [],
    });

    expect(metrics).toMatchObject({
      attemptedRuns: 18,
      successfulRuns: 15,
      failedRuns: 3,
      mentionRatePercent: 67,
      coveredSurfaces: 2,
      totalSurfaces: 3,
    });
  });

  it("keeps a configured surface that failed every run in the surface list", () => {
    const { surfaces } = buildAiChatMetrics({
      periodDays: 30,
      runs,
      targets,
      promptTags: [],
    });

    expect(surfaces.map((surface) => surface.surface)).toEqual([
      "ChatGPT",
      "Perplexity",
      "Gemini",
    ]);
    expect(surfaces).toContainEqual({
      surface: "Perplexity",
      provider: "Bright Data",
      configured: true,
      successfulRuns: 0,
      failedRuns: 3,
      mentions: 0,
    });
  });

  it("derives prompt categories from tags rather than leaving them to inference", () => {
    const { promptCategories } = buildAiChatMetrics({
      periodDays: 30,
      runs: [],
      targets: [],
      promptTags: [["discovery"], ["comparison"], ["discovery"], []],
    });

    expect(promptCategories).toEqual([
      { category: "discovery", prompts: 2 },
      { category: "comparison", prompts: 1 },
      { category: "Uncategorized", prompts: 1 },
    ]);
  });

  it("instructs the model to quote aggregates rather than the run sample", () => {
    const prompt = buildAiChatSystemPrompt(emptyContext);

    expect(prompt).toContain("never report its sampleSize as the brand");
    expect(prompt).toContain("including surfaces whose runs all failed");
    expect(prompt).toContain("do not say the competitor list is empty");
    expect(prompt).toContain("When both are genuinely empty, say so plainly");
    expect(prompt).toContain("pendingCompetitors comes from a bounded sample");
    expect(prompt).toContain(
      "never state a confidence score or a mention count",
    );
    expect(prompt).toContain("Do not invent a category name");
  });
  it("reports runs still in flight so the counts reconcile", () => {
    const { metrics } = buildAiChatMetrics({
      periodDays: 30,
      runs: [
        {
          provider: "brightdata",
          model: "chatgpt",
          status: "succeeded",
          brandMentioned: true,
        },
        {
          provider: "brightdata",
          model: "chatgpt",
          status: "running",
          brandMentioned: false,
        },
        {
          provider: "brightdata",
          model: "chatgpt",
          status: "pending",
          brandMentioned: false,
        },
      ],
      targets: [{ provider: "brightdata", model: "chatgpt" }],
      promptTags: [],
    });

    // Every run in the window is accounted for in exactly one bucket, so the
    // model is never left with an unexplained gap between the counts.
    expect(metrics).toMatchObject({
      successfulRuns: 1,
      failedRuns: 0,
      runningRuns: 1,
      pendingRuns: 1,
    });
  });

  it("does not claim a surface is configured when no targets are set", () => {
    const { metrics, surfaces } = buildAiChatMetrics({
      periodDays: 30,
      runs: [
        {
          provider: "brightdata",
          model: "chatgpt",
          status: "succeeded",
          brandMentioned: true,
        },
      ],
      targets: [],
      promptTags: [],
    });

    expect(metrics.totalSurfaces).toBe(0);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]?.configured).toBe(false);
  });

  it("lets the model state an empty competitor list honestly", () => {
    const prompt = buildAiChatSystemPrompt(emptyContext);

    expect(prompt).toContain("When either list has entries");
    expect(prompt).toContain("trackedPrompts is a capped sample");
  });
});

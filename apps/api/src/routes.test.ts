import { describe, expect, it } from "vitest";
import {
  aiChatMessageInput,
  competitorApprovalInput,
  competitorInput,
  competitorDiscoverySettingsInput,
  opportunityUpdateInput,
  promptUpdateInput,
} from "./routes";

describe("competitorInput", () => {
  it("accepts web URLs and rejects non-web schemes", () => {
    for (const website of [
      "https://competitor.example",
      "http://competitor.example/path",
      null,
      undefined,
    ]) {
      expect(
        competitorInput.safeParse({ name: "Example", website }).success,
      ).toBe(true);
    }
    for (const website of [
      "javascript:alert(1)",
      "data:text/html,test",
      "vbscript:msgbox(1)",
    ]) {
      expect(
        competitorInput.safeParse({ name: "Example", website }).success,
      ).toBe(false);
    }
  });
});

describe("promptUpdateInput", () => {
  it("does not apply creation defaults to omitted update fields", () => {
    expect(promptUpdateInput.parse({ cadenceMinutes: 1_440 })).toEqual({
      cadenceMinutes: 1_440,
    });
  });

  it("only accepts daily and weekly prompt cadences", () => {
    expect(
      promptUpdateInput.safeParse({ cadenceMinutes: 10_080 }).success,
    ).toBe(true);
    for (const cadenceMinutes of [60, 360, 720]) {
      expect(promptUpdateInput.safeParse({ cadenceMinutes }).success).toBe(
        false,
      );
    }
  });
});

describe("aiChatMessageInput", () => {
  it("accepts a useful message and rejects empty input", () => {
    expect(
      aiChatMessageInput.parse({ content: "  Audit my citations  " }),
    ).toEqual({ content: "Audit my citations" });
    expect(aiChatMessageInput.safeParse({ content: "   " }).success).toBe(
      false,
    );
  });

  it("accepts bounded typed UI context and rejects oversized or unknown fields", () => {
    const valid = aiChatMessageInput.parse({
      content: "What is this metric?",
      uiContext: {
        route: "/app/brands/project-a",
        page: "Dashboard",
        projectId: "project-a",
        organizationId: "ignored-client-boundary",
        visibleState: { period: "30d", engine: "ChatGPT" },
        insights: [
          {
            id: "mention-rate",
            label: "Mention rate",
            page: "Dashboard",
            value: "24%",
            text: "Mention rate 24%",
          },
        ],
      },
    });
    expect(valid.uiContext?.insights[0]?.id).toBe("mention-rate");
    expect(valid.uiContext?.insights[0]?.page).toBe("Dashboard");
    expect(
      aiChatMessageInput.safeParse({
        content: "x",
        uiContext: {
          route: "/",
          page: "x",
          insights: [{ id: "x", label: "x", text: "x".repeat(1_201) }],
        },
      }).success,
    ).toBe(false);
    expect(
      aiChatMessageInput.safeParse({
        content: "x",
        uiContext: {
          route: "/",
          page: "x",
          insights: [],
          authorization: "Bearer stolen",
        },
      }).success,
    ).toBe(false);
  });
});

describe("opportunityUpdateInput", () => {
  it("accepts persisted workflow progress and rejects malformed updates", () => {
    expect(opportunityUpdateInput.parse({ status: "in_progress" })).toEqual({
      status: "in_progress",
    });
    expect(
      opportunityUpdateInput.parse({
        completedActionIndices: [0, 2],
        dueAt: "2026-09-15T00:00:00.000Z",
        relatedOpportunityIds: ["00000000-0000-4000-8000-000000000001"],
      }),
    ).toEqual({
      completedActionIndices: [0, 2],
      dueAt: "2026-09-15T00:00:00.000Z",
      relatedOpportunityIds: ["00000000-0000-4000-8000-000000000001"],
    });
    expect(
      opportunityUpdateInput.safeParse({ status: "archived" }).success,
    ).toBe(false);
    expect(
      opportunityUpdateInput.safeParse({ completedActionIndices: [4] }).success,
    ).toBe(false);
  });
});

describe("competitorApprovalInput", () => {
  it("accepts reviewable discovery evidence and rejects an empty bulk approval", () => {
    expect(competitorApprovalInput.safeParse({ suggestions: [] }).success).toBe(
      false,
    );
    expect(
      competitorApprovalInput.parse({
        suggestions: [
          {
            key: "profound",
            name: "Profound",
            mentionCount: 3,
            promptCount: 2,
            providerCount: 2,
          },
        ],
      }).suggestions[0]?.aliases,
    ).toEqual([]);
  });
});

describe("competitorDiscoverySettingsInput", () => {
  it("supports a configurable safe mention threshold", () => {
    expect(
      competitorDiscoverySettingsInput.parse({ minimumMentions: "4" }),
    ).toEqual({ range: "90d", minimumMentions: 4 });
    expect(
      competitorDiscoverySettingsInput.safeParse({ minimumMentions: 1 })
        .success,
    ).toBe(false);
  });
});

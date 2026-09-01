import { describe, expect, it } from "vitest";
import { appendAiChatTurn } from "./ai-chat-controller";
import type { AiChatSendResponse } from "./types";

describe("shared AI chat controller", () => {
  it("publishes the identical user and assistant messages to popup and full-page cache consumers", () => {
    const base = {
      sessionId: "s1",
      citations: [],
      model: null,
      createdAt: "2026-08-28T00:00:00Z",
    };
    const response = {
      session: {
        id: "s1",
        projectId: "p1",
        title: "Chat",
        createdAt: base.createdAt,
        updatedAt: base.createdAt,
      },
      userMessage: { ...base, id: "u1", role: "user", content: "Question" },
      assistantMessage: {
        ...base,
        id: "a1",
        role: "assistant",
        content: "Answer",
      },
      uiActions: [
        { type: "show_ui_insight", insightId: "metric", label: "Metric" },
      ],
    } as AiChatSendResponse;
    expect(
      appendAiChatTurn(undefined, response).map(({ id, content }) => ({
        id,
        content,
      })),
    ).toEqual([
      { id: "u1", content: "Question" },
      { id: "a1", content: "Answer" },
    ]);
  });
});

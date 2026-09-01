import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessage } from "./AiChatPage";

describe("full-page AI chat", () => {
  it("renders the shared answer and sources without popup UI actions", () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        message={{
          id: "a",
          sessionId: "s",
          role: "assistant",
          content: "Mention rate is 24%.",
          citations: [
            {
              url: "https://example.com",
              domain: "example.com",
              title: "Example source",
              position: 1,
            },
          ],
          model: "m",
          createdAt: "2026-08-28T00:00:00Z",
        }}
      />,
    );
    expect(html).toContain("Mention rate is 24%");
    expect(html).toContain("rounded-xl border border-base-300");
    expect(html).not.toContain("Show Mention rate");
    expect(html).not.toContain("Example source");
  });
});

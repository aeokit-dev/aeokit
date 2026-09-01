import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import {
  AiChatPopup,
  automaticNavigationPage,
  ChatUiActions,
  chatSuggestions,
  ChatPopupNewChatButton,
  ChatPopupEmptyState,
  ChatPopupHistorySelect,
  PopupAssistantMessage,
  shouldShowChatPopupLoader,
} from "./AiChatPopup";

const project: Project = {
  id: "project-a",
  name: "MacSpotter",
  website: "https://macspotter.example",
  aliases: [],
  additionalDomains: [],
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

describe("AI chat popup", () => {
  it("auto-navigates only actions explicitly marked for immediate execution", () => {
    expect(
      automaticNavigationPage([
        {
          type: "open_app_page",
          page: "citations",
          label: "Citations",
          executeImmediately: true,
        },
      ]),
    ).toBe("citations");
    expect(
      automaticNavigationPage([
        {
          type: "open_app_page",
          page: "prompts",
          label: "Prompts",
          executeImmediately: false,
        },
      ]),
    ).toBeNull();
  });

  it("stops loading when the project has no chat sessions", () => {
    expect(shouldShowChatPopupLoader(false, null, true)).toBe(false);
  });

  it("is available from the bottom-right app shell", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AiChatPopup project={project} appBasePath="/app/brands/project-a" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('aria-label="Open AI chat"');
    expect(html).toContain("fixed bottom-4 right-4");
  });

  it("renders approved actions only through the popup action component", () => {
    const html = renderToStaticMarkup(
      <ChatUiActions
        actions={[
          {
            type: "show_ui_insight",
            insightId: "dashboard-mention-rate",
            label: "Mention rate",
          },
          {
            type: "open_app_page",
            page: "prompts",
            label: "Prompts",
            executeImmediately: false,
          },
        ]}
        onShow={() => "shown"}
        onNavigate={() => undefined}
      />,
    );
    expect(html).toContain("Show Mention rate");
    expect(html).toContain("Open Prompts");
    expect(html).not.toContain("run_javascript");
  });

  it("offers a new-chat action from the popup", () => {
    const html = renderToStaticMarkup(
      <ChatPopupNewChatButton pending={false} onCreate={() => undefined} />,
    );

    expect(html).toContain('aria-label="New chat"');
  });

  it("offers page-aware empty-state suggestions", () => {
    expect(chatSuggestions("/app/brands/p/citations")[0]).toContain(
      "citations",
    );
    expect(chatSuggestions("/app/brands/p/prompts")[0]).toContain("prompts");
  });

  it("uses a compact history control and card-style suggestions", () => {
    const history = renderToStaticMarkup(
      <ChatPopupHistorySelect
        sessions={[
          {
            id: "s1",
            projectId: "p1",
            title: "New chat",
            createdAt: "2026-08-28",
            updatedAt: "2026-08-28",
          },
          {
            id: "s2",
            projectId: "p1",
            title: "Earlier chat",
            createdAt: "2026-08-27",
            updatedAt: "2026-08-27",
          },
        ]}
        activeSessionId="s1"
        onChange={() => undefined}
      />,
    );
    const empty = renderToStaticMarkup(
      <ChatPopupEmptyState
        pathname="/app/brands/p"
        onSelect={() => undefined}
      />,
    );
    expect(history).toContain("select-sm max-w-full");
    expect(history).not.toContain("select-xs w-full");
    expect(empty).toContain("Ask about this page");
    expect(empty).toContain("rounded-xl border border-base-300");
  });

  it("does not append external citation pills to compact popup messages", () => {
    const html = renderToStaticMarkup(
      <PopupAssistantMessage
        content="Grounded answer"
        citations={[
          {
            url: "https://example.com",
            domain: "example.com",
            title: "Example",
            position: 1,
          },
        ]}
        actions={[]}
        onShow={() => "shown"}
        onNavigate={() => undefined}
      />,
    );
    expect(html).toContain("Grounded answer");
    expect(html).toContain("rounded-xl border border-base-300");
    expect(html).not.toContain("Example");
    expect(html).not.toContain("https://example.com");
  });
});

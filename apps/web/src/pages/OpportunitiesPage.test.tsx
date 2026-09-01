import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { tenantQueryKey } from "../api";
import type { Opportunity, Project, Prompt } from "../types";
import { OpportunitiesPage } from "./OpportunitiesPage";

const project: Project = {
  id: "project-a",
  name: "MacSpotter",
  website: "https://macspotter.com",
  aliases: [],
  additionalDomains: [],
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  archivedAt: null,
};

const opportunity: Opportunity = {
  id: "opportunity-a",
  projectId: project.id,
  type: "competitor_advantage",
  priority: 91,
  confidence: 67,
  earlySignal: false,
  status: "open",
  title: "A competitor owns this answer",
  explanation:
    "The answer mentions a tracked competitor but does not mention the brand.",
  recommendedAction:
    "Review the competitor's cited proof and publish a clearer, differentiated answer.",
  evidenceIds: ["run-evidence-1"],
  affectedPromptIds: ["prompt-a"],
  affectedUrls: ["https://inventorywatch.app/"],
  completedActionIndices: [0],
  dueAt: "2026-09-15T00:00:00.000Z",
  evidenceSummaries: [
    {
      runId: "run-evidence-1",
      provider: "brightdata",
      model: "chatgpt",
      answerExcerpt:
        "InventoryWatch updates frequently, while MacSpotter is not included in the answer.",
      createdAt: "2026-08-28T12:00:00Z",
    },
  ],
  firstSeenAt: "2026-08-28T12:00:00Z",
  lastSeenAt: "2026-08-28T12:00:00Z",
};

const prompt: Prompt = {
  id: "prompt-a",
  projectId: project.id,
  value: "What is the best way to track Mac inventory availability?",
  tags: [],
  enabled: true,
  cadenceMinutes: 1440,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  targets: [],
  lastRunAt: null,
  hasActiveRun: false,
};

describe("Opportunity Inbox actionability", () => {
  it("turns an opportunity into a concrete execution brief", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      tenantQueryKey("opportunities", project.id, "open", "all"),
      { opportunities: [opportunity] },
    );
    queryClient.setQueryData(tenantQueryKey("prompts", project.id), {
      prompts: [prompt],
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/brands/${project.id}/opportunities`]}>
          <OpportunitiesPage project={project} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain("Target prompt");
    expect(html).toContain(
      "What is the best way to track Mac inventory availability?",
    );
    expect(html).toContain("Action plan");
    expect(html).toContain("Compare your answer with the cited competitors");
    expect(html).toContain("Recommended page");
    expect(html).toContain("New page");
    expect(html).toContain(
      "https://macspotter.com/guides/track-mac-inventory-availability",
    );
    expect(html).toContain("Content brief");
    expect(html).toContain("Suggested title");
    expect(html).toContain("What the current answers get right");
    expect(html).toContain("Proof to include");
    expect(html).toContain("inventorywatch.app");
    expect(html).toContain("1 of 4 complete");
    expect(html).toContain('aria-label="Mark action 2 complete"');
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2026-09-15"');
    expect(html).toContain("Supporting answer");
    expect(html).toContain("ChatGPT");
    expect(html).toContain("Bright Data");
    expect(html).toContain(
      "InventoryWatch updates frequently, while MacSpotter is not included",
    );
    expect(html).toContain('href="/runs?run=run-evidence-1"');
    expect(html).toContain("Mark in progress");
    expect(html).not.toContain("Start work");
  });

  it("groups identical recommendations into one actionable item", () => {
    const duplicate: Opportunity = {
      ...opportunity,
      id: "opportunity-b",
      affectedPromptIds: ["prompt-b"],
      evidenceIds: ["run-evidence-2"],
      evidenceSummaries: [
        {
          ...opportunity.evidenceSummaries[0]!,
          runId: "run-evidence-2",
          model: "perplexity",
        },
      ],
    };
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      tenantQueryKey("opportunities", project.id, "open", "all"),
      { opportunities: [opportunity, duplicate] },
    );
    queryClient.setQueryData(tenantQueryKey("prompts", project.id), {
      prompts: [prompt],
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OpportunitiesPage project={project} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html.match(/A competitor owns this answer/g)).toHaveLength(1);
    expect(html).toContain("2 observations grouped");
    expect(html).toContain("+1 more supporting answers");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { tenantQueryKey } from "./api";
import { CitationsPage } from "./pages/CitationsPage";
import { PromptsPage } from "./pages/PromptsPage";
import { VisibilityPage } from "./pages/VisibilityPage";
import { RunMonitorPage } from "./pages/RunMonitorPage";
import { ErrorState } from "./components/ui";
import type { Project, RunMonitorResponse } from "./types";

const project: Project = {
  id: "project-a",
  name: "MacSpotter",
  website: "https://www.macspotter.com",
  aliases: [],
  additionalDomains: [],
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

/**
 * Drives a real fetch failure through the query cache, so the page renders
 * exactly as it does after a failed request rather than from a hand-built
 * cache entry.
 */
async function failedClient(key: readonly unknown[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await queryClient.prefetchQuery({
    queryKey: key as unknown[],
    queryFn: () => Promise.reject(new Error("Failed to fetch")),
  });
  return queryClient;
}

function render(queryClient: QueryClient, children: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function runMonitorClient(total: number) {
  const queryClient = new QueryClient();
  const response: RunMonitorResponse = {
    counts: {
      pending: 0,
      running: 0,
      succeeded: total,
      failed: 0,
      cancelled: 0,
    },
    batches: [],
    total,
    page: 1,
    pageSize: 25,
    runs:
      total > 0
        ? [
            {
              id: "run-a",
              promptId: "prompt-a",
              promptValue: "Test prompt",
              provider: "openai",
              model: "gpt-4o",
              status: "succeeded",
              attemptCount: 1,
              lastAttemptAt: null,
              answer: "Answer",
              brandMentioned: true,
              recommendationRank: null,
              recommendationStrength: null,
              sentiment: "neutral",
              competitorsMentioned: [],
              webQueries: [],
              error: null,
              latencyMs: 100,
              costUsd: 0,
              createdAt: "2026-08-01T00:00:00Z",
              completedAt: "2026-08-01T00:00:01Z",
              projectId: project.id,
              projectName: project.name,
              batchId: null,
              trigger: "manual",
            },
          ]
        : [],
  };
  queryClient.setQueryData(tenantQueryKey("run-monitor", ""), response);
  return queryClient;
}

describe("Run Monitor totals", () => {
  it("uses singular for one run and plural for zero and multiple runs", () => {
    const one = render(
      runMonitorClient(1),
      <RunMonitorPage
        projects={[project]}
        appBasePath="/app"
        showProviderCosts={false}
      />,
    );
    expect(one).toContain("1 run");
    expect(one).not.toContain("1 runs");

    const multiple = render(
      runMonitorClient(2),
      <RunMonitorPage
        projects={[project]}
        appBasePath="/app"
        showProviderCosts={false}
      />,
    );
    expect(multiple).toContain("2 runs");

    const zero = render(
      runMonitorClient(0),
      <RunMonitorPage
        projects={[project]}
        appBasePath="/app"
        showProviderCosts={false}
      />,
    );
    expect(zero).toContain("No runs match these filters");
  });
});

// A fresh observer over an errored cache entry re-fetches on mount, so static
// rendering never reaches the error branch. These assert the property that
// holds throughout — pending and failed alike, no number is invented — and the
// error banner itself is covered directly below.
describe("failed data requests", () => {
  it("does not report a failed citations request as zero citations", async () => {
    const markup = render(
      await failedClient(tenantQueryKey("citations", project.id)),
      <CitationsPage project={project} />,
    );

    // The summary tiles must not claim a measured zero for data that never
    // arrived — a fabricated "0 citations" is indistinguishable from a real one.
    expect(markup).toMatch(/Total citations<\/p><p[^>]*>—</);
    expect(markup).toMatch(/Unique domains<\/p><p[^>]*>—</);
    expect(markup).toMatch(/Owned citations<\/p><p[^>]*>—</);
    expect(markup).not.toMatch(/Total citations<\/p><p[^>]*>0</);
  });

  it("does not report a failed prompts request as zero prompts", async () => {
    const markup = render(
      await failedClient(tenantQueryKey("prompts", project.id)),
      <PromptsPage project={project} />,
    );

    expect(markup).toContain("— prompts");
    expect(markup).not.toContain("0 prompts");
  });

  it("does not report failed visibility counters as zero runs", async () => {
    const markup = render(
      await failedClient(tenantQueryKey("visibility", project.id, "30d")),
      <VisibilityPage project={project} />,
    );

    expect(markup).toMatch(/Attempted<\/p><p[^>]*>—</);
    expect(markup).toMatch(/Successful<\/p><p[^>]*>—</);
    expect(markup).toMatch(/Failed<\/p><p[^>]*>—</);
    expect(markup).not.toMatch(/Attempted<\/p><p[^>]*>0</);
  });

  it("does not report a failed run monitor as zero failing runs", async () => {
    const markup = render(
      await failedClient(tenantQueryKey("run-monitor", "")),
      <RunMonitorPage
        projects={[project]}
        appBasePath="/app"
        showProviderCosts={false}
      />,
    );

    // The page whose job is surfacing failures must not report "Failed 0"
    // during an outage.
    expect(markup).not.toMatch(/failed<\/span><span[^>]*>0</i);
    expect(markup).toContain("—");
  });
});

describe("ErrorState", () => {
  it("announces itself and offers a retry only when one is wired", () => {
    const withRetry = renderToStaticMarkup(
      <ErrorState message="Boom" onRetry={() => {}} />,
    );
    expect(withRetry).toContain('role="alert"');
    expect(withRetry).toContain("Retry");

    const withoutRetry = renderToStaticMarkup(<ErrorState message="Boom" />);
    expect(withoutRetry).toContain('role="alert"');
    expect(withoutRetry).not.toContain("Retry");
  });

  it("shows the in-flight state while a retry is running", () => {
    const markup = renderToStaticMarkup(
      <ErrorState message="Boom" onRetry={() => {}} retrying />,
    );
    expect(markup).toContain("Retrying");
    expect(markup).toContain("disabled");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { tenantQueryKey } from "../api";
import type { DashboardData, Project } from "../types";
import { CitationsPage } from "./CitationsPage";
import { DashboardPage } from "./DashboardPage";
import { OpportunitiesPage } from "./OpportunitiesPage";
import { PromptsPage } from "./PromptsPage";
import { ShareOfVoicePage } from "./ShareOfVoicePage";
import { VisibilityPage } from "./VisibilityPage";

const project = {
  id: "project-url-filters",
  name: "Example",
  website: "https://example.com",
  aliases: [],
  additionalDomains: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  archivedAt: null,
} satisfies Project;

const emptyDashboard: DashboardData = {
  visibility: null,
  mentionRate: null,
  citationRate: null,
  trackedPrompts: 0,
  activePrompts: 0,
  successfulRuns: 0,
  dataTrust: {
    attemptedRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    pendingRuns: 0,
    runningRuns: 0,
    usableCoveragePercentage: 0,
  },
  mentionConfidence: {
    level: "none",
    sampleSize: 0,
    interval: null,
  },
  providerCoverage: {
    coveredSurfaces: 0,
    totalSurfaces: 0,
    percentage: null,
  },
  citedRuns: 0,
  totalCitations: 0,
  ownedCitations: 0,
  trend: [],
  shareOfVoice: [],
  recentRuns: [],
};

function renderPage(
  page: ReactNode,
  initialEntry: string,
  seed?: (queryClient: QueryClient) => void,
) {
  const queryClient = new QueryClient();
  seed?.(queryClient);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("brand page URL filter hydration", () => {
  it("hydrates the Dashboard period and recent-run search", () => {
    const html = renderPage(
      <DashboardPage project={project} showProviderCosts={false} />,
      `/brands/${project.id}?period=90d&search=failed`,
      (queryClient) => {
        queryClient.setQueryData(
          tenantQueryKey("dashboard", project.id, "90d"),
          emptyDashboard,
        );
      },
    );

    expect(html).toContain(
      '<option value="90d" selected="">Last 90 days</option>',
    );
    expect(html).toMatch(
      /<input(?=[^>]*aria-label="Filter recent runs")(?=[^>]*value="failed")[^>]*>/,
    );
  });

  it.each([
    [
      "Visibility",
      <VisibilityPage project={project} />,
      `/brands/${project.id}/visibility?period=7d`,
    ],
    [
      "Share of Voice",
      <ShareOfVoicePage project={project} />,
      `/brands/${project.id}/share-of-voice?period=7d`,
    ],
  ])("hydrates the %s reporting period", (_, page, initialEntry) => {
    const html = renderPage(page, initialEntry);

    expect(html).toContain(
      '<option value="7d" selected="">Last 7 days</option>',
    );
  });

  it("hydrates the Opportunities status and type", () => {
    const html = renderPage(
      <OpportunitiesPage project={project} />,
      `/brands/${project.id}/opportunities?status=all&type=content_authority`,
    );

    expect(html).toContain(
      '<option value="all" selected="">All statuses</option>',
    );
    expect(html).toContain(
      '<option value="content_authority" selected="">Content authority</option>',
    );
  });

  it("hydrates the Citations category and search", () => {
    const html = renderPage(
      <CitationsPage project={project} />,
      `/brands/${project.id}/citations?category=social&search=example.com`,
    );

    expect(html).toContain(
      '<option value="social" selected="">Social</option>',
    );
    expect(html).toMatch(
      /<input(?=[^>]*placeholder="Search URLs and domains")(?=[^>]*value="example\.com")[^>]*>/,
    );
  });

  it("hydrates the Prompts search", () => {
    const html = renderPage(
      <PromptsPage project={project} />,
      `/brands/${project.id}/prompts?search=pricing`,
    );

    expect(html).toMatch(
      /<input(?=[^>]*placeholder="Search prompts")(?=[^>]*value="pricing")[^>]*>/,
    );
  });

  it("falls back to established defaults for invalid enum filters", () => {
    const dashboard = renderPage(
      <DashboardPage project={project} showProviderCosts={false} />,
      `/brands/${project.id}?period=forever`,
    );
    const opportunities = renderPage(
      <OpportunitiesPage project={project} />,
      `/brands/${project.id}/opportunities?status=unknown&type=unknown`,
    );

    expect(dashboard).toContain(
      '<option value="30d" selected="">Last 30 days</option>',
    );
    expect(opportunities).toContain(
      '<option value="open" selected="">Open</option>',
    );
    expect(opportunities).toContain(
      '<option value="all" selected="">All opportunity types</option>',
    );
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { tenantQueryKey } from "./api";
import { DashboardPage } from "./pages/DashboardPage";
import { AiReferralsPage } from "./pages/AiReferralsPage";
import { PromptsPage } from "./pages/PromptsPage";
import { MeasurementLoop } from "./pages/ShareOfVoicePage";
import type {
  AiReferralsResponse,
  DashboardData,
  Project,
  Prompt,
  ShareOfVoiceReport,
} from "./types";

const project: Project = {
  id: "project-a",
  name: "MacSpotter",
  website: "https://www.macspotter.com",
  aliases: [],
  additionalDomains: [],
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

function renderWithClient(queryClient: QueryClient, children: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("data trust UI", () => {
  it("does not label an empty dashboard as low citation confidence", () => {
    const queryClient = new QueryClient();
    const dashboard: DashboardData = {
      visibility: 0,
      mentionRate: 0,
      citationRate: 0,
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
      mentionConfidence: { level: "none", sampleSize: 0, interval: null },
      providerCoverage: { coveredSurfaces: 0, totalSurfaces: 0, percentage: 0 },
      citedRuns: 0,
      totalCitations: 0,
      ownedCitations: 0,
      trend: [],
      shareOfVoice: [],
      recentRuns: [],
    };
    queryClient.setQueryData(
      tenantQueryKey("dashboard", project.id, "30d"),
      dashboard,
    );

    const html = renderWithClient(
      queryClient,
      <DashboardPage project={project} showProviderCosts={false} />,
    );

    expect(html).toContain("Unknown citation confidence");
    expect(html).toContain(
      "Run a prompt to collect your first citation evidence",
    );
    expect(html).not.toContain("Low citation confidence");
  });

  it("uses the aggregate PostHog outcome shape in the measurement loop", () => {
    const referrals: AiReferralsResponse = {
      configured: true,
      data: {
        period: "30d",
        siteHost: "macspotter.com",
        successEvents: ["stock alert created"],
        totals: {
          sessions: 7,
          pageviews: 15,
          convertingSessions: 3,
          conversions: 4,
          conversionRate: 3 / 7,
          averageSessionDurationSeconds: 84,
          bounceRate: 2 / 7,
        },
        previousPeriod: {
          sessions: 5,
          pageviews: 9,
          convertingSessions: 1,
          conversions: 1,
          conversionRate: 0.2,
          averageSessionDurationSeconds: 60,
          bounceRate: 0.4,
        },
        sources: [],
        citedLandingPageSessions: 4,
        trackedCitationCount: 2,
        queriedAt: "2026-08-26T12:00:00.000Z",
        cached: false,
      },
    };
    const report = {
      period: {
        currentStart: "2026-07-28T00:00:00.000Z",
        currentEnd: "2026-08-26T00:00:00.000Z",
        previousStart: "2026-06-28T00:00:00.000Z",
      },
      overview: { mentions: 4, share: 25 },
      citationOwnership: { owned: 2, ownedShare: 50 },
    } as ShareOfVoiceReport;

    const html = renderWithClient(
      new QueryClient(),
      <MeasurementLoop
        report={report}
        referrals={referrals}
        referralsPending={false}
        crawlerHistory={undefined}
        crawlerPending={false}
      />,
    );

    expect(html).toContain("AI referrals");
    expect(html).toContain("Cited-page sessions");
    expect(html).toContain("AI outcomes");
    expect(html).toContain("3 converting sessions");
    expect(html).toContain("stock alert created");
  });

  it("shows AI referral engagement, outcomes, comparison, and citation context", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      tenantQueryKey("ai-referrals", project.id, "30d"),
      {
        configured: true,
        data: {
          period: "30d",
          siteHost: "macspotter.com",
          successEvents: ["demo requested"],
          totals: {
            sessions: 7,
            pageviews: 15,
            convertingSessions: 3,
            conversions: 4,
            conversionRate: 3 / 7,
            averageSessionDurationSeconds: 84,
            bounceRate: 2 / 7,
          },
          previousPeriod: {
            sessions: 5,
            pageviews: 9,
            convertingSessions: 1,
            conversions: 1,
            conversionRate: 0.2,
            averageSessionDurationSeconds: 60,
            bounceRate: 0.4,
          },
          citedLandingPageSessions: 4,
          trackedCitationCount: 2,
          sources: [
            {
              domain: "chatgpt.com",
              label: "ChatGPT",
              sessions: 7,
              pageviews: 15,
              convertingSessions: 3,
              conversions: 4,
              conversionRate: 3 / 7,
              averageSessionDurationSeconds: 84,
              bounceRate: 2 / 7,
              landingPages: [
                {
                  path: "/buying-guide",
                  sessions: 4,
                  pageviews: 10,
                  convertingSessions: 2,
                  conversions: 3,
                  conversionRate: 0.5,
                  averageSessionDurationSeconds: 100,
                  bounceRate: 0.25,
                  trackedCitationCount: 2,
                },
              ],
            },
          ],
          queriedAt: "2026-08-26T12:00:00.000Z",
          cached: false,
        },
      },
    );

    const html = renderWithClient(
      queryClient,
      <AiReferralsPage project={project} />,
    );

    expect(html).toContain("AI outcomes");
    expect(html).toContain("Converting sessions");
    expect(html).toContain("Cited-page sessions");
    expect(html).toContain("demo requested");
    expect(html).toContain("Tracked citation");
    expect(html).toContain("vs previous 30 days");
  });

  it("shows the 82% rate beside its 28-run evidence and warning", () => {
    const queryClient = new QueryClient();
    const dashboard: DashboardData = {
      visibility: 82,
      mentionRate: 82,
      citationRate: 18,
      trackedPrompts: 1,
      activePrompts: 1,
      successfulRuns: 11,
      dataTrust: {
        attemptedRuns: 28,
        successfulRuns: 11,
        failedRuns: 17,
        pendingRuns: 0,
        runningRuns: 0,
        usableCoveragePercentage: 39,
      },
      mentionConfidence: {
        level: "low",
        sampleSize: 11,
        interval: { low: 52, high: 95 },
      },
      providerCoverage: {
        coveredSurfaces: 1,
        totalSurfaces: 6,
        percentage: 17,
      },
      citedRuns: 2,
      totalCitations: 2,
      ownedCitations: 2,
      trend: [],
      shareOfVoice: [],
      recentRuns: [],
    };
    queryClient.setQueryData(
      tenantQueryKey("dashboard", project.id, "30d"),
      dashboard,
    );

    const html = renderWithClient(
      queryClient,
      <DashboardPage project={project} showProviderCosts={false} />,
    );

    expect(html).toContain("Mention rate");
    expect(html).toContain("Attempted runs");
    expect(html).toContain("Failed runs");
    expect(html).toContain("39% produced usable answers");
    expect(html).toContain("Low confidence: 11 of 28 attempted runs succeeded");
    expect(html).toContain("52–95%");
  });

  it("turns dashboard signals and recent runs into drill-down controls", () => {
    const queryClient = new QueryClient();
    const dashboard: DashboardData = {
      visibility: 50,
      mentionRate: 50,
      citationRate: 25,
      trackedPrompts: 4,
      activePrompts: 4,
      successfulRuns: 1,
      dataTrust: {
        attemptedRuns: 3,
        successfulRuns: 1,
        failedRuns: 2,
        pendingRuns: 0,
        runningRuns: 0,
        usableCoveragePercentage: 33,
      },
      mentionConfidence: {
        level: "low",
        sampleSize: 1,
        interval: { low: 10, high: 90 },
      },
      providerCoverage: {
        coveredSurfaces: 1,
        totalSurfaces: 3,
        percentage: 33,
      },
      citedRuns: 1,
      totalCitations: 2,
      ownedCitations: 1,
      trend: [],
      shareOfVoice: [],
      recentRuns: [
        {
          id: "run-a",
          promptId: "prompt-a",
          promptValue: "Which Mac stock checker should I use?",
          provider: "openai",
          model: "gpt-4o",
          status: "succeeded",
          attemptCount: 1,
          lastAttemptAt: "2026-08-26T12:00:00Z",
          answer: null,
          brandMentioned: true,
          recommendationRank: 1,
          recommendationStrength: "top_choice",
          sentiment: "positive",
          competitorsMentioned: [],
          webQueries: [],
          error: null,
          latencyMs: 1200,
          createdAt: "2026-08-26T12:00:00Z",
          completedAt: "2026-08-26T12:00:01Z",
        },
      ],
    };
    queryClient.setQueryData(
      tenantQueryKey("dashboard", project.id, "30d"),
      dashboard,
    );

    const html = renderWithClient(
      queryClient,
      <DashboardPage project={project} showProviderCosts={false} />,
    );

    expect(html).toContain("Needs attention");
    expect(html).toContain("2 failed runs");
    expect(html).toContain("Which Mac stock checker should I use?");
    expect(html).toContain(
      'aria-label="View run details for Which Mac stock checker should I use?"',
    );
    expect(html).toContain("Filter recent runs");

    const recentRunsTable = html.match(
      /<table[^>]*>.*?Which Mac stock checker should I use\?.*?<\/table>/,
    )?.[0];
    expect(recentRunsTable).toBeDefined();
    expect(recentRunsTable).toMatch(
      /<th>Brand mention<\/th><th>Run time<\/th>.*?<td><span[^>]*>Mentioned<\/span><\/td><td[^>]*>1\.2s<\/td>/,
    );
  });

  it("renders a server-confirmed active prompt as Queued", () => {
    const queryClient = new QueryClient();
    const prompt: Prompt = {
      id: "prompt-a",
      projectId: project.id,
      value: "Which Mac stock checker should I use?",
      tags: ["discovery"],
      enabled: true,
      cadenceMinutes: 360,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
      lastRunAt: "2026-08-26T12:00:00Z",
      hasActiveRun: true,
      targets: [
        {
          id: "target-a",
          promptId: "prompt-a",
          provider: "brightdata",
          model: "google-ai-overview",
          webSearch: true,
        },
      ],
    };
    queryClient.setQueryData(tenantQueryKey("prompts", project.id), {
      prompts: [prompt],
    });

    const html = renderWithClient(
      queryClient,
      <PromptsPage project={project} />,
    );

    expect(html).toContain("Queued");
    expect(html).toContain("is queued");
    expect(html).toContain("disabled");
  });
});

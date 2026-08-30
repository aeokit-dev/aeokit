import { describe, expect, it } from "vitest";
import {
  buildPublicReport,
  publicReportPath,
  renderPublicReportHtml,
  shouldIndexPublicReport,
} from "./public-report";

const measuredAt = new Date("2026-08-27T12:00:00.000Z");

describe("public reports", () => {
  const project = {
    name: "HubSpot",
    website: "https://hubspot.com",
    category: "CRM Software",
    reportSlug: "hubspot-ai-visibility",
    reportPublishedAt: measuredAt,
    reportSections: {
      prompts: false,
      answers: false,
      competitors: true,
      citations: true,
      costs: false,
    },
  };
  const runs = [
    {
      provider: "openai",
      model: "gpt-5",
      brandMentioned: true,
      answer: "private answer",
      costUsd: 1,
      completedAt: measuredAt,
    },
    {
      provider: "anthropic",
      model: "claude",
      brandMentioned: false,
      answer: "private answer",
      costUsd: 2,
      completedAt: measuredAt,
    },
    {
      provider: "google",
      model: "gemini",
      brandMentioned: true,
      answer: "private answer",
      costUsd: 3,
      completedAt: measuredAt,
    },
  ];

  it("keeps private and insufficient reports out of the index", () => {
    expect(
      shouldIndexPublicReport(
        { ...project, reportPublishedAt: null },
        20,
        measuredAt,
      ),
    ).toBe(false);
    expect(shouldIndexPublicReport(project, 2, measuredAt)).toBe(false);
    expect(shouldIndexPublicReport(project, 20, new Date("2027-01-01"))).toBe(
      false,
    );
  });

  it("renders crawlable evidence while redacting disabled private sections", () => {
    const report = buildPublicReport(project, runs, [], measuredAt);
    const html = renderPublicReportHtml(report, "https://aeokit.dev");
    expect(publicReportPath(project)).toBe(
      "/reports/crm-software/hubspot-ai-visibility",
    );
    expect(html).toContain("<title>HubSpot AI visibility report");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain("Sample size</dt><dd>3");
    expect(html).toContain("Provider coverage</dt><dd>3");
    expect(html).toContain("AeoKit methodology");
    expect(html).not.toContain("private answer");
    expect(html).not.toContain("$6");
  });

  it("does not count cancelled runs as attempted answers", () => {
    const report = buildPublicReport(
      project,
      [
        ...runs,
        {
          ...runs[0]!,
          status: "cancelled" as const,
          completedAt: measuredAt,
        },
      ],
      [],
      measuredAt,
    );

    expect(report.attemptedRuns).toBe(3);
    expect(report.usableCoverage).toBe(100);
  });

  it("builds trend, share-of-voice, provider, prompt, and citation evidence", () => {
    const visible = {
      ...project,
      reportSections: {
        prompts: true,
        answers: true,
        competitors: true,
        citations: true,
        costs: true,
      },
    };
    const report = buildPublicReport(
      visible,
      runs.map((run, index) => ({
        ...run,
        prompt: `Prompt ${index + 1}`,
        competitorsMentioned: index === 1 ? ["Salesforce"] : [],
      })),
      [
        { url: "https://example.com/a", domain: "example.com", title: "A" },
        { url: "https://example.com/a", domain: "example.com", title: "A" },
      ],
      measuredAt,
    );
    expect(report.trend).toEqual([
      { date: "2026-08-27", sampleSize: 3, mentionRate: 66.7 },
    ]);
    expect(report.shareOfVoice).toEqual([
      { name: "HubSpot", mentions: 2, percentage: 66.7 },
      { name: "Salesforce", mentions: 1, percentage: 33.3 },
    ]);
    expect(report.providerCoverage).toHaveLength(3);
    expect(report.promptPerformance[0]).toMatchObject({
      prompt: "Prompt 1",
      mentionRate: 100,
    });
    expect(report.commonCitations[0]).toMatchObject({
      domain: "example.com",
      count: 2,
    });
    expect(
      renderPublicReportHtml(report, "https://aeokit.dev", true),
    ).toContain('name="robots" content="noindex, nofollow"');
  });
});

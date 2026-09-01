import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { tenantQueryKey } from "./api";
import {
  AddCompetitorModal,
  CompetitorsPage,
  isSafeWebsiteUrl,
} from "./pages/CompetitorsPage";
import type { CompetitorDiscoveryResponse, Project } from "./types";

const project: Project = {
  id: "00000000-0000-4000-8000-000000000017",
  name: "Audit Brand",
  website: "https://audit.example",
  aliases: [],
  additionalDomains: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("competitor discovery UI", () => {
  it("only considers HTTP(S) websites safe", () => {
    expect(isSafeWebsiteUrl("https://competitor.example")).toBe(true);
    expect(isSafeWebsiteUrl("http://competitor.example/path")).toBe(true);
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,test",
      "vbscript:msgbox(1)",
    ]) {
      expect(isSafeWebsiteUrl(value)).toBe(false);
    }
  });

  it("gives add competitor fields explicit accessible names", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <AddCompetitorModal
          open
          project={project}
          onClose={() => undefined}
          onCreated={() => undefined}
        />
      </QueryClientProvider>,
    );
    for (const label of ["Name", "Website", "Aliases", "Domains"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain('id="add-competitor-name"');
    expect(html).toContain('for="add-competitor-name"');
    expect(html).toContain('id="add-competitor-website"');
    expect(html).toContain('for="add-competitor-website"');
    expect(html).toContain('id="add-competitor-aliases"');
    expect(html).toContain('for="add-competitor-aliases"');
    expect(html).toContain('id="add-competitor-domains"');
    expect(html).toContain('for="add-competitor-domains"');
  });

  it("renders review evidence, confidence, controls, and zero-query cost guidance", () => {
    const client = new QueryClient();
    client.setQueryData(tenantQueryKey("project", project.id), {
      project: { ...project, competitors: [] },
    });
    const discovery: CompetitorDiscoveryResponse = {
      range: "90d",
      answersAnalyzed: 12,
      providerQueryCostUsd: 0,
      expectedAdditionalRuns: 0,
      suggestions: [
        {
          key: "profound",
          name: "Profound",
          aliases: [],
          mentionCount: 6,
          mentionPercentage: 50,
          promptCount: 3,
          providerCount: 2,
          confidenceScore: 88,
          confidence: "high",
          evidence: [
            {
              runId: "30000000-0000-4000-8000-000000000017",
              promptId: "10000000-0000-4000-8000-000000000017",
              prompt: "Which platform is strongest?",
              provider: "openai",
              model: "gpt-5",
              excerpt: "Profound is a leading option.",
              completedAt: "2026-08-26T00:00:00.000Z",
            },
          ],
        },
      ],
    };
    client.setQueryData(
      tenantQueryKey("competitor-suggestions", project.id, "90d", 2),
      discovery,
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CompetitorsPage
            project={project}
            projectBasePath={`/brands/${project.id}`}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain("Discovered competitors");
    expect(html).toContain("88% confidence");
    expect(html).toContain("Why this was suggested");
    expect(html).toContain("Profound is a leading option.");
    expect(html).toContain("12 stored answers analyzed");
    expect(html).toContain("$0 provider-query cost");
    expect(html).toContain("Reanalyze history");
    expect(html).toContain("Minimum mentions");
    expect(html).toContain(`href="/brands/${project.id}/prompts"`);
    expect(html).toContain(
      `/brands/${project.id}/runs?run=30000000-0000-4000-8000-000000000017`,
    );
    expect(html).toContain('aria-label="Select Profound"');
    expect(html).toContain("Dismiss");
    expect(html).toContain("Approve");
  });

  it("renders unsafe stored websites as inert text", () => {
    const client = new QueryClient();
    client.setQueryData(tenantQueryKey("project", project.id), {
      project: {
        ...project,
        competitors: [
          {
            id: "20000000-0000-4000-8000-000000000017",
            name: "Unsafe competitor",
            website: "javascript:alert(1)",
            aliases: [],
            domains: [],
          },
        ],
      },
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CompetitorsPage
            project={project}
            projectBasePath={`/brands/${project.id}`}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(html).toContain("javascript:alert(1)");
    expect(html).not.toContain('href="javascript:alert(1)"');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "../types";
import { AppShell } from "./AppShell";

const project: Project = {
  id: "project-a",
  name: "MacSpotter",
  website: "https://www.macspotter.com",
  aliases: [],
  additionalDomains: [],
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  archivedAt: null,
};

describe("AppShell mobile navigation", () => {
  it("keeps the Open sidebar control accessible and 44px square", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AppShell
            project={project}
            projects={[project]}
            archivedProjects={[]}
            onProjectChange={() => undefined}
            projectBasePath="/brands/project-a"
          >
            <div>Content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('aria-label="Open sidebar"');
    expect(html).toContain("btn-square btn-ghost min-h-11 min-w-11");
  });
});

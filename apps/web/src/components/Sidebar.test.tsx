import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../types";
import { ArchivedBrandsModal, Sidebar } from "./Sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

describe("Sidebar project switcher", () => {
  it("gives mobile close and navigation controls 44px touch targets", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Sidebar
          project={project}
          projects={[project]}
          onProjectChange={vi.fn()}
          onClose={vi.fn()}
          hosted
          appBasePath="/app"
        />
      </MemoryRouter>,
    );

    expect(html).toContain('aria-label="Close sidebar"');
    expect(html).toContain("min-h-11 min-w-11");
    expect(html).toContain("relative flex min-h-11");
    expect(html).toContain(">Account<");
    expect(html).toContain(">Workspace<");
  });

  it("does not keep Dashboard active on another brand view", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/app/brands/project-a/prompts"]}>
        <Sidebar
          project={project}
          projects={[project]}
          onProjectChange={vi.fn()}
          projectBasePath="/app/brands/project-a"
          appBasePath="/app"
          hosted
        />
      </MemoryRouter>,
    );

    const links = [...html.matchAll(/<a[^>]*>.*?<\/a>/g)].map(
      (match) => match[0],
    );
    const dashboardLink = links.find((link) => link.includes(">Dashboard<"));
    const promptsLink = links.find((link) => link.includes(">Prompts<"));

    expect(dashboardLink).not.toContain('aria-current="page"');
    expect(promptsLink).toContain('aria-current="page"');
    expect(html).toContain(">Experiments<");
  });

  it("identifies the active brand by website and provides contextual settings", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Sidebar
          project={project}
          projects={[project]}
          onProjectChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("macspotter.com");
    expect(html).toContain('aria-label="Brand settings"');
  });

  it("exposes the active brand switcher as a listbox popup", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Sidebar
          project={project}
          projects={[project]}
          onProjectChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('aria-label="Switch brand"');
    expect(html).toContain('aria-haspopup="listbox"');
  });

  it("keeps brand settings contextual instead of duplicating it in the footer", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Sidebar
          project={project}
          projects={[project]}
          onProjectChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(html.match(/href="\/settings"/g)).toHaveLength(1);
    const bottomArea = html.slice(html.indexOf("border-t border-base-300"));
    expect(bottomArea).not.toContain('href="/settings"');
  });

  it("keeps the self-hosted footer focused on documentation", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Sidebar
          project={project}
          projects={[project]}
          onProjectChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Documentation");
    expect(html).not.toContain("Help &amp; Community");
    expect(html).not.toContain("Source · AGPL-3.0");
    expect(html).not.toContain("Self-hosted");
  });

  it("makes global navigation search discoverable", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Sidebar
          project={project}
          projects={[project]}
          onProjectChange={vi.fn()}
          onSearchOpen={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Search");
    expect(html).toContain("⌘K");
    expect(html).toContain('aria-label="Search navigation"');
  });
});

describe("Archived brands", () => {
  it("provides a place to see and restore archived brands", () => {
    const archivedProject: Project = {
      ...project,
      id: "project-archived",
      name: "Archived Acme",
      archivedAt: "2026-08-27T12:00:00Z",
    };
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ArchivedBrandsModal
          open
          projects={[archivedProject]}
          onClose={vi.fn()}
          onRestored={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(html).toContain("Archived brands");
    expect(html).toContain("Archived Acme");
    expect(html).toContain("Restore brand");
  });
});

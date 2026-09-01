import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import { SettingsPage } from "./SettingsPage";

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

describe("Settings appearance", () => {
  it("offers system, light, and dark theme preferences", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage project={project} />
      </QueryClientProvider>,
    );

    expect(html).toContain('aria-label="Theme preference"');
    expect(html).toContain('aria-label="System"');
    expect(html).toContain('aria-label="Light"');
    expect(html).toContain('aria-label="Dark"');
  });

  it("lets hosted users mint and revoke runtime API keys", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage project={project} hosted />
      </QueryClientProvider>,
    );

    expect(html).toContain("API keys");
    expect(html).toContain("Create API key");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExperimentsPage } from "./ExperimentsPage";
import type { Project } from "../types";

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

describe("ExperimentsPage", () => {
  it("exposes the project experiment workspace and baseline creation", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { enabled: false, retry: false } },
          })
        }
      >
        <ExperimentsPage project={project} initialCreateOpen />
      </QueryClientProvider>,
    );

    expect(html).toContain("Experiments");
    expect(html).toContain("MacSpotter");
    expect(html).toContain("Hypothesis");
    expect(html).toContain("Baseline run IDs");
    expect(html).toContain("Baseline metrics (JSON)");
  });
});

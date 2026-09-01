import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { AddPromptModal } from "./PromptsPage";
import type { Project } from "../types";

const project = {
  id: "project-prompts",
  name: "Example",
  website: "https://example.com",
  aliases: [],
  additionalDomains: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
} satisfies Project;

describe("Add prompt accessibility", () => {
  it("associates every field label with its control", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <AddPromptModal
          open
          project={project}
          providers={[]}
          onClose={() => undefined}
          onCreated={() => undefined}
        />
      </QueryClientProvider>,
    );
    for (const id of [
      "add-prompt-value",
      "add-prompt-tags",
      "add-prompt-surface",
      "add-prompt-cadence",
    ]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`for="${id}"`);
    }
    expect(html).toContain(
      'placeholder="What are the best open-source AEO platforms?"',
    );
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FilteredEmptyState } from "./components/ui";

describe("collection empty states", () => {
  it("keeps the onboarding message and creation action for an empty collection", () => {
    const html = renderToStaticMarkup(
      <FilteredEmptyState
        hasItems={false}
        hasActiveFilters={false}
        emptyTitle="No prompts yet"
        emptyDescription="Add your first prompt to start tracking AI visibility."
        emptyAction={<button>Add prompt</button>}
        filteredTitle="No matching prompts"
        filteredDescription="No prompts match your search."
        onClear={vi.fn()}
      />,
    );

    expect(html).toContain("No prompts yet");
    expect(html).toContain("Add your first prompt");
    expect(html).toContain("Add prompt");
    expect(html).not.toContain("Clear search");
  });

  it.each([
    [
      "prompts",
      "No matching prompts",
      "No prompts match your search.",
      "Clear search",
    ],
    [
      "citations",
      "No matching citations",
      "No citations match your search and filters.",
      "Clear search and filters",
    ],
    [
      "competitors",
      "No matching competitors",
      "No competitors match your search.",
      "Clear search",
    ],
  ])(
    "explains and clears filtered %s results",
    (_, title, description, clearLabel) => {
      const html = renderToStaticMarkup(
        <FilteredEmptyState
          hasItems
          hasActiveFilters
          emptyTitle="Empty collection"
          emptyDescription="Onboarding guidance"
          filteredTitle={title}
          filteredDescription={description}
          clearLabel={clearLabel}
          onClear={vi.fn()}
        />,
      );

      expect(html).toContain(title);
      expect(html).toContain(description);
      expect(html).toContain(clearLabel);
      expect(html).not.toContain("Onboarding guidance");
    },
  );
});

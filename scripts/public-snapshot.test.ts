import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public repository snapshot", () => {
  it("excludes discarded brand exploration assets", () => {
    expect(existsSync("design/aeokit-brand-concepts")).toBe(false);
  });

  it("documents the required public CI status check", () => {
    const launchGuide = readFileSync("docs/GITHUB_LAUNCH.md", "utf8");

    expect(launchGuide).toMatch(
      /requires the\s+`verify` GitHub Actions check before merging/,
    );
    expect(launchGuide).not.toContain(
      "Do not require GitHub Actions status checks",
    );
  });
});

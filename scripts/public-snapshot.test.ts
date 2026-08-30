import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

  it("contains only aeokit package names and no obsolete UI evidence", () => {
    const manifests = execFileSync("git", ["ls-files", "*package.json"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const manifestPath of manifests) {
      expect(readFileSync(manifestPath, "utf8")).not.toContain("@openaeo/");
    }

    for (const path of [
      "artifacts",
      ".github/issue-evidence",
      "docs/pr-artifacts",
      "docs/aeokit-evidence-pipeline.html",
    ]) {
      expect(existsSync(path), `${path} should not be published`).toBe(false);
    }
  });
});

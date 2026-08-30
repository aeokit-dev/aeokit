import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const dependabotPath = new URL("../.github/dependabot.yml", import.meta.url);

describe("GitHub Actions CI workflow", () => {
  it("runs every documented repository verification gate", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("github.event.repository.private == false");
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).not.toMatch(/^\s+cache:/m);
    expect(workflow).not.toContain("upload-artifact");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("pnpm format:check");
    expect(workflow).toContain("pnpm typecheck");
    expect(workflow).toContain("pnpm test");
    expect(workflow).toContain("pnpm build");
    expect(workflow).toContain("pnpm audit --audit-level high");
  });

  it("uses action releases that run natively on Node.js 24", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("actions/checkout@v7");
    expect(workflow).toContain("actions/setup-node@v7");
    expect(workflow).toContain("pnpm/action-setup@v6");
    expect(workflow).toContain("package-manager-cache: false");
  });

  it("avoids grouped pnpm updates that Dependabot cannot generate", () => {
    const dependabot = readFileSync(dependabotPath, "utf8");

    expect(dependabot).not.toContain("groups:");
    expect(dependabot).toContain("default-days: 0");
  });
});

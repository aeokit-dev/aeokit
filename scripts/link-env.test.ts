import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = new URL("./link-env.sh", import.meta.url).pathname;
const installerPath = new URL("./install-git-hooks.sh", import.meta.url)
  .pathname;
const hookPath = new URL("../.githooks/post-checkout", import.meta.url)
  .pathname;
const temporaryDirectories: string[] = [];

function git(cwd: string, ...arguments_: string[]) {
  return execFileSync("git", arguments_, { cwd, encoding: "utf8" }).trim();
}

function createRepositoryWithWorktree() {
  const parent = mkdtempSync(join(tmpdir(), "aeokit-link-env-"));
  temporaryDirectories.push(parent);

  const primaryWorktree = join(parent, "primary");
  const linkedWorktree = join(parent, "linked");

  git(parent, "init", primaryWorktree);
  writeFileSync(join(primaryWorktree, "tracked.txt"), "tracked\n");
  git(primaryWorktree, "add", "tracked.txt");
  git(
    primaryWorktree,
    "-c",
    "user.name=Test User",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-m",
    "Initial commit",
  );
  git(primaryWorktree, "worktree", "add", "-b", "linked", linkedWorktree);

  return { linkedWorktree, primaryWorktree };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("link-env.sh", () => {
  it("links .env when Git creates a worktree", () => {
    const parent = mkdtempSync(join(tmpdir(), "aeokit-link-env-hook-"));
    temporaryDirectories.push(parent);

    const primaryWorktree = join(parent, "primary");
    const linkedWorktree = join(parent, "linked");
    git(parent, "init", primaryWorktree);

    mkdirSync(join(primaryWorktree, ".githooks"));
    mkdirSync(join(primaryWorktree, "scripts"));
    copyFileSync(hookPath, join(primaryWorktree, ".githooks/post-checkout"));
    copyFileSync(
      installerPath,
      join(primaryWorktree, "scripts/install-git-hooks.sh"),
    );
    chmodSync(join(primaryWorktree, ".githooks/post-checkout"), 0o755);
    chmodSync(join(primaryWorktree, "scripts/install-git-hooks.sh"), 0o755);
    git(primaryWorktree, "add", ".githooks", "scripts");
    git(
      primaryWorktree,
      "-c",
      "user.name=Test User",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "Initial commit",
    );

    const primaryEnvironment = join(primaryWorktree, ".env");
    writeFileSync(primaryEnvironment, "OPENROUTER_API_KEY=test\n", {
      mode: 0o600,
    });
    execFileSync(
      "sh",
      [join(primaryWorktree, "scripts/install-git-hooks.sh")],
      { cwd: primaryWorktree, encoding: "utf8" },
    );

    const installedHook = resolve(
      primaryWorktree,
      git(primaryWorktree, "rev-parse", "--git-path", "hooks/post-checkout"),
    );
    expect(readFileSync(installedHook, "utf8")).toBe(
      readFileSync(hookPath, "utf8"),
    );
    expect(() =>
      git(primaryWorktree, "config", "--get", "core.hooksPath"),
    ).toThrow();

    git(primaryWorktree, "worktree", "add", "-b", "linked", linkedWorktree);

    const linkedEnvironment = join(linkedWorktree, ".env");
    expect(realpathSync(linkedEnvironment)).toBe(
      realpathSync(primaryEnvironment),
    );
  });

  it("links a secondary worktree's .env to the primary worktree's .env", () => {
    const { linkedWorktree, primaryWorktree } = createRepositoryWithWorktree();
    const primaryEnvironment = join(primaryWorktree, ".env");
    const linkedEnvironment = join(linkedWorktree, ".env");
    writeFileSync(primaryEnvironment, "OPENROUTER_API_KEY=test\n", {
      mode: 0o600,
    });

    execFileSync("sh", [scriptPath], {
      cwd: linkedWorktree,
      encoding: "utf8",
    });

    expect(readlinkSync(linkedEnvironment)).toBe(
      join(realpathSync(primaryWorktree), ".env"),
    );
    expect(realpathSync(linkedEnvironment)).toBe(
      realpathSync(primaryEnvironment),
    );
  });

  it("refuses to replace a regular .env in the linked worktree", () => {
    const { linkedWorktree, primaryWorktree } = createRepositoryWithWorktree();
    writeFileSync(join(primaryWorktree, ".env"), "SOURCE=primary\n");
    const linkedEnvironment = join(linkedWorktree, ".env");
    writeFileSync(linkedEnvironment, "SOURCE=linked\n");

    expect(() =>
      execFileSync("sh", [scriptPath], {
        cwd: linkedWorktree,
        encoding: "utf8",
      }),
    ).toThrow();

    expect(lstatSync(linkedEnvironment).isSymbolicLink()).toBe(false);
    expect(readFileSync(linkedEnvironment, "utf8")).toBe("SOURCE=linked\n");
  });
});

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

describe("headless runtime repository boundary", () => {
  it("does not contain hosted UI or Cloudflare deployment applications", () => {
    expect(existsSync(new URL("apps/web/package.json", root))).toBe(false);
    expect(existsSync(new URL("apps/cloudflare/package.json", root))).toBe(
      false,
    );
  });

  it("keeps root commands focused on the portable runtime", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("package.json", root), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(Object.keys(manifest.scripts)).not.toEqual(
      expect.arrayContaining([
        "dev:cloudflare",
        "cloudflare:build",
        "cloudflare:deploy",
      ]),
    );
  });
});

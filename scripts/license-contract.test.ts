import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageFiles = [
  "package.json",
  "apps/api/package.json",
  "apps/worker/package.json",
  "packages/cloudflare-analytics/package.json",
  "packages/core/package.json",
  "packages/db/package.json",
];

describe("open-source license contract", () => {
  it("licenses every workspace package under AGPL-3.0-only", () => {
    for (const file of packageFiles) {
      const packageJson = JSON.parse(readFileSync(file, "utf8")) as {
        license?: string;
      };

      expect(packageJson.license, file).toBe("AGPL-3.0-only");
    }
  });

  it("publishes the canonical AGPLv3 text and README notice", () => {
    const license = readFileSync("LICENSE", "utf8");
    const readme = readFileSync("README.md", "utf8");

    expect(license).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(license).toContain("Version 3, 19 November 2007");
    expect(license).toContain("13. Remote Network Interaction");
    expect(readme).toContain("GNU Affero General Public License v3.0");
    expect(readme).not.toContain("Apache License 2.0");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compose = readFileSync(
  new URL("../../../compose.yaml", import.meta.url),
  "utf8",
);

describe("Docker Compose network exposure", () => {
  it("publishes the unauthenticated local runtime on loopback only", () => {
    expect(compose).toContain('      - "127.0.0.1:3000:8787"');
    expect(compose).not.toMatch(/^\s*-\s*["']?3000:8787["']?\s*$/m);
  });
});

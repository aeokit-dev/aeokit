import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  apiKeyPrefix,
  bearerToken,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
} from "./index.js";

describe("portable API keys", () => {
  it("generates one-time secrets and verifies only their hashes", async () => {
    const key = generateApiKey();
    const hash = await hashApiKey(key);

    expect(key).toMatch(/^aeo_live_[A-Za-z0-9_-]{43}$/);
    expect(apiKeyPrefix(key)).toBe(key.slice(0, 20));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(verifyApiKey(key, [hash])).resolves.toBe(true);
    await expect(verifyApiKey(`${API_KEY_PREFIX}wrong`, [hash])).resolves.toBe(
      false,
    );
  });

  it("extracts strict bearer credentials", () => {
    expect(bearerToken("Bearer aeo_live_secret")).toBe("aeo_live_secret");
    expect(bearerToken("bearer token")).toBe("token");
    expect(bearerToken("Basic token")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

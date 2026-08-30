import { describe, expect, it } from "vitest";
import { createRuntimeApp } from "./runtime";
import { generateApiKey, hashApiKey } from "@aeokit/auth";

describe("headless runtime", () => {
  it("exposes runtime metadata as JSON instead of serving a web UI", async () => {
    const response = await createRuntimeApp().request("http://localhost/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      name: "aeokit",
      mode: "headless",
      health: "/api/health",
      api: "/api",
      docs: "/docs",
      openapi: "/openapi.json",
    });
  });

  it("returns JSON for unknown routes and never falls back to index.html", async () => {
    const response = await createRuntimeApp().request(
      "http://localhost/app/brands/example",
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("keeps local mode login-free and gates opt-in self-hosted mode", async () => {
    const local = await createRuntimeApp().request(
      "http://localhost/api/does-not-exist",
    );
    expect(local.status).toBe(404);

    const key = generateApiKey();
    const protectedApp = createRuntimeApp({
      auth: { mode: "api-key", keyHashes: [await hashApiKey(key)] },
    });
    const missing = await protectedApp.request(
      "http://localhost/api/does-not-exist",
    );
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toEqual({
      error: "A valid bearer API key is required",
    });

    const authenticated = await protectedApp.request(
      "http://localhost/api/does-not-exist",
      { headers: { Authorization: `Bearer ${key}` } },
    );
    expect(authenticated.status).toBe(404);
  });
});

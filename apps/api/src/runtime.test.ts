import { describe, expect, it } from "vitest";
import { createRuntimeApp } from "./runtime";

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
});

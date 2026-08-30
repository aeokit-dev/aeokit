import { describe, expect, it, vi } from "vitest";
import { AeokitApiError, AeokitClient } from "./client";

describe("AeokitClient", () => {
  it("uses the same bearer key for CLI and MCP API requests", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ ok: true, projects: [] }),
    );
    const client = new AeokitClient({
      baseUrl: "https://cloud.aeokit.dev/",
      apiKey: "aeo_live_test",
      fetchFn,
    });

    await client.request("/api/projects");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://cloud.aeokit.dev/api/projects",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer aeo_live_test",
        }),
      }),
    );
  });

  it("surfaces API errors", async () => {
    const client = new AeokitClient({
      fetchFn: async () =>
        Response.json({ error: "Invalid key" }, { status: 401 }),
    });
    await expect(client.request("/api/projects")).rejects.toEqual(
      new AeokitApiError("Invalid key", 401),
    );
  });
});

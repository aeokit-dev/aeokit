import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("API errors", () => {
  it("turns structured validation failures into a useful message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { issues: [{ message: "UI context is too large" }] },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    await expect(api("/chat", { method: "POST", body: "{}" })).rejects.toThrow(
      "UI context is too large",
    );
  });

  it("retains the API error code for integration-specific UI states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Cloudflare analytics is not connected.",
            code: "cloudflare_not_configured",
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(api("/projects/project-a/crawler-traffic")).rejects.toEqual(
      expect.objectContaining({
        code: "cloudflare_not_configured",
        status: 503,
      }),
    );
  });
});

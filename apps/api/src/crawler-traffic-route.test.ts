import { describe, expect, it, vi } from "vitest";
import { CloudflareCrawlerTrafficError } from "@openaeo/cloudflare-analytics";
import { createCrawlerTrafficRoutes } from "./crawler-traffic-route";

const projectId = "8b943d6f-6e42-4a10-b50d-627f6ad1d2d9";

describe("crawler traffic API route", () => {
  it("validates project IDs before accessing the database", async () => {
    const findProject = vi.fn();
    const app = createCrawlerTrafficRoutes({
      findProject,
      getCrawlerTraffic: vi.fn(),
    });
    const response = await app.request("/projects/not-a-uuid/crawler-traffic");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid project ID",
    });
    expect(findProject).not.toHaveBeenCalled();
  });

  it("returns not found without querying Cloudflare", async () => {
    const getCrawlerTraffic = vi.fn();
    const app = createCrawlerTrafficRoutes({
      findProject: vi.fn().mockResolvedValue(null),
      getCrawlerTraffic,
    });
    const response = await app.request(
      `/projects/${projectId}/crawler-traffic`,
    );
    expect(response.status).toBe(404);
    expect(getCrawlerTraffic).not.toHaveBeenCalled();
  });

  it("returns the aggregated crawler traffic contract", async () => {
    const data = {
      totalRequests: 200,
      identifiedCrawlerRequests: 25,
      crawlerSharePercentage: 12.5,
      families: [{ family: "OpenAI" as const, requests: 25 }],
      topUserAgents: [
        { userAgent: "GPTBot/1.2", family: "OpenAI" as const, requests: 25 },
      ],
      start: "2026-08-25T12:00:00.000Z",
      end: "2026-08-26T12:00:00.000Z",
    };
    const app = createCrawlerTrafficRoutes({
      findProject: vi
        .fn()
        .mockResolvedValue({ website: "https://www.example.com" }),
      getCrawlerTraffic: vi.fn().mockResolvedValue(data),
    });
    const response = await app.request(
      `/projects/${projectId}/crawler-traffic`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data);
  });

  it("maps expected Cloudflare errors to safe API responses", async () => {
    const app = createCrawlerTrafficRoutes({
      findProject: vi
        .fn()
        .mockResolvedValue({ website: "https://example.com" }),
      getCrawlerTraffic: vi
        .fn()
        .mockRejectedValue(
          new CloudflareCrawlerTrafficError(
            "cloudflare_insufficient_permissions",
          ),
        ),
    });
    const response = await app.request(
      `/projects/${projectId}/crawler-traffic`,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error:
        "The Cloudflare token does not have permission to read this zone's analytics.",
      code: "cloudflare_insufficient_permissions",
    });
  });

  it("redacts unexpected upstream errors and secrets", async () => {
    const secret = "cf-secret-that-must-not-leak";
    const app = createCrawlerTrafficRoutes({
      findProject: vi
        .fn()
        .mockResolvedValue({ website: "https://example.com" }),
      getCrawlerTraffic: vi
        .fn()
        .mockRejectedValue(new Error(`Authorization: Bearer ${secret}`)),
    });
    const response = await app.request(
      `/projects/${projectId}/crawler-traffic`,
    );
    const body = JSON.stringify(await response.json());
    expect(response.status).toBe(502);
    expect(body).not.toContain(secret);
    expect(body).toContain("cloudflare_unavailable");
  });
});

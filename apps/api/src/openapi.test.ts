import { describe, expect, it } from "vitest";
import { createRuntimeApp } from "./runtime";

interface OpenApiDocument {
  openapi: string;
  info: { title: string };
  paths: Record<string, Record<string, unknown>>;
}

describe("OpenAPI documentation", () => {
  it("serves an OpenAPI 3.1 document for every API operation", async () => {
    const app = createRuntimeApp();
    const response = await app.request("http://localhost/openapi.json");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const document = (await response.json()) as OpenApiDocument;
    expect(document.openapi).toBe("3.1.0");
    expect(document.info.title).toBe("Aeokit Runtime API");

    for (const route of app.routes) {
      if (!route.path.startsWith("/api") || route.method === "ALL") continue;
      const path = route.path.replace(/:([^/]+)/g, "{$1}");
      expect(
        document.paths[path]?.[route.method.toLowerCase()],
        `${route.method} ${route.path} is missing from OpenAPI`,
      ).toBeDefined();
    }
  });

  it("serves an interactive API reference", async () => {
    const response = await createRuntimeApp().request("http://localhost/docs");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("/openapi.json");
  });
});

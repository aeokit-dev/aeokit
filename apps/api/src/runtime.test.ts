import { describe, expect, it } from "vitest";
import { createRuntimeApp } from "./runtime";
import { generateApiKey, hashApiKey } from "@aeokit/auth";

async function mcpPayload(response: Response) {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice(6);
    if (!data) throw new Error("MCP SSE response did not contain a data event");
    return JSON.parse(data) as unknown;
  }
  return JSON.parse(text) as unknown;
}

describe("headless runtime", () => {
  it("exposes runtime metadata with its bundled local console", async () => {
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
      mcp: "/api/mcp",
      ui: "/app",
    });
  });

  it("serves the complete bundled product UI without hosted account features", async () => {
    const response = await createRuntimeApp().request("http://localhost/app");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/\/app\/assets\/[^"']+\.js/);
    expect(html).not.toContain("Billing");
    expect(html).not.toContain("Sign in");
  });

  it("serves full dashboard routes through the public runtime SPA", async () => {
    const response = await createRuntimeApp().request(
      "http://localhost/app/brands/00000000-0000-4000-8000-000000000001/experiments",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('<div id="root"></div>');
    const asset = html.match(/(\/app\/assets\/[^"']+\.js)/)?.[1];
    expect(asset).toBeTruthy();
    const bundle = await createRuntimeApp().request(`http://localhost${asset}`);
    expect(bundle.status).toBe(200);
    const javascript = await bundle.text();
    expect(javascript).toContain("Experiments");
    expect(javascript).toContain("Create experiment");
    expect(javascript).toContain("Baseline run IDs");
    expect(html).not.toContain("Billing");
    expect(javascript).not.toContain("Sign in");
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

  it("serves MCP Streamable HTTP through the existing bearer boundary", async () => {
    const key = generateApiKey();
    const app = createRuntimeApp({
      auth: { mode: "api-key", keyHashes: [await hashApiKey(key)] },
    });
    const initialize = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "aeokit-agent-test", version: "0.1.0" },
      },
    });
    const headers = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    };

    const missing = await app.request("http://localhost/api/mcp", {
      method: "POST",
      headers,
      body: initialize,
    });
    expect(missing.status).toBe(401);

    const authenticated = await app.request("http://localhost/api/mcp", {
      method: "POST",
      headers: { ...headers, Authorization: `Bearer ${key}` },
      body: initialize,
    });
    expect(authenticated.status).toBe(200);
    await expect(mcpPayload(authenticated)).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "aeokit", version: "0.1.0" },
      },
    });

    const listed = await app.request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        ...headers,
        Authorization: `Bearer ${key}`,
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    expect(listed.status).toBe(200);
    const listedPayload = (await mcpPayload(listed)) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(listedPayload.result.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "aeokit_health",
        "aeokit_list_projects",
        "aeokit_get",
        "aeokit_getHealth",
      ]),
    );

    const called = await app.request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        ...headers,
        Authorization: `Bearer ${key}`,
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "aeokit_getConfig", arguments: {} },
      }),
    });
    expect(called.status).toBe(200);
    await expect(mcpPayload(called)).resolves.toMatchObject({
      id: 3,
      result: {
        structuredContent: { showProviderCosts: expect.any(Boolean) },
      },
    });
  });
});

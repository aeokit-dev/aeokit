import { describe, expect, it, vi } from "vitest";
import { apiToolsFromOpenApi, createAeokitMcpServer } from "./mcp";

const document = {
  openapi: "3.1.0",
  info: { title: "AeoKit Runtime API", version: "0.1.0" },
  paths: {
    "/api/projects/{projectId}/runs": {
      get: {
        operationId: "getProjectsByProjectIdRuns",
        summary: "Get project runs",
        parameters: [
          {
            name: "projectId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 },
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "array",
              items: { type: "string", enum: ["complete", "failed"] },
            },
          },
        ],
      },
    },
    "/api/prompts/{promptId}/run": {
      post: {
        operationId: "postPromptsByPromptIdRun",
        summary: "Start prompt run",
        parameters: [{ name: "promptId", in: "path", required: true }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["samples"],
                additionalProperties: false,
                properties: {
                  samples: { type: "integer", minimum: 1, maximum: 5 },
                },
              },
            },
          },
        },
        "x-aeokit-mcp": {
          cost: true,
          confirmation: "Starting this run may spend provider credits.",
        },
      },
    },
  },
};

describe("OpenAPI-driven MCP tools", () => {
  it("preserves stable explicit MCP tools alongside generated operations", async () => {
    const request = vi.fn(async (path: string) =>
      path === "/openapi.json" ? document : {},
    );
    const server = await createAeokitMcpServer({ request } as never);
    const registered = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;

    expect(Object.keys(registered)).toEqual(
      expect.arrayContaining([
        "aeokit_health",
        "aeokit_list_projects",
        "aeokit_get",
        "aeokit_getProjectsByProjectIdRuns",
        "aeokit_postPromptsByPromptIdRun",
      ]),
    );
  });

  it("turns every documented API operation into a namespaced tool", () => {
    const request = vi.fn();
    const tools = apiToolsFromOpenApi(document, { request } as never);

    expect(tools.map((tool) => tool.name)).toEqual([
      "aeokit_getProjectsByProjectIdRuns",
      "aeokit_postPromptsByPromptIdRun",
    ]);
    expect(tools[0]?.annotations.readOnlyHint).toBe(true);
    expect(tools[1]?.description).toContain("may spend provider credits");
  });

  it("encodes path and query input into the API request", async () => {
    const request = vi.fn(async () => ({ runs: [] }));
    const [tool] = apiToolsFromOpenApi(document, { request } as never);

    await tool!.execute({
      projectId: "project/one",
      limit: 10,
      status: ["complete", "failed"],
    });

    expect(request).toHaveBeenCalledWith(
      "/api/projects/project%2Fone/runs?limit=10&status=complete&status=failed",
      { method: "GET" },
    );
  });

  it("passes mutation bodies without duplicating endpoint code", async () => {
    const request = vi.fn(async () => ({ queued: true }));
    const tools = apiToolsFromOpenApi(document, { request } as never);

    await tools[1]!.execute({ promptId: "prompt-1", body: { samples: 1 } });

    expect(request).toHaveBeenCalledWith("/api/prompts/prompt-1/run", {
      method: "POST",
      body: JSON.stringify({ samples: 1 }),
    });
  });

  it("validates inputs from the OpenAPI parameter and body schemas", async () => {
    const request = vi.fn(async () => ({}));
    const tools = apiToolsFromOpenApi(document, { request } as never);

    await expect(
      tools[0]!.execute({ projectId: "project-1", limit: 0 }),
    ).rejects.toThrow();
    await expect(
      tools[1]!.execute({ promptId: "prompt-1", body: { samples: 0 } }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("classifies methods and explicit risk metadata", () => {
    const request = vi.fn();
    const tools = apiToolsFromOpenApi(document, { request } as never);

    expect(tools[0]?.classification).toEqual({
      access: "read",
      destructive: false,
      cost: false,
      confirmation: undefined,
    });
    expect(tools[1]?.classification).toEqual({
      access: "write",
      destructive: false,
      cost: true,
      confirmation: "Starting this run may spend provider credits.",
    });
  });
});

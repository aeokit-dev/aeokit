import { describe, expect, it, vi } from "vitest";
import { apiToolsFromOpenApi } from "./mcp";

const document = {
  openapi: "3.1.0",
  info: { title: "AeoKit Runtime API", version: "0.1.0" },
  paths: {
    "/api/projects/{projectId}/runs": {
      get: {
        operationId: "getProjectsByProjectIdRuns",
        summary: "Get project runs",
        parameters: [{ name: "projectId", in: "path", required: true }],
      },
    },
    "/api/prompts/{promptId}/run": {
      post: {
        operationId: "postPromptsByPromptIdRun",
        summary: "Start prompt run",
        parameters: [{ name: "promptId", in: "path", required: true }],
        requestBody: { required: true },
        "x-aeokit-mcp": {
          cost: true,
          confirmation: "Starting this run may spend provider credits.",
        },
      },
    },
  },
};

describe("OpenAPI-driven MCP tools", () => {
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
      query: { limit: 10, status: ["complete", "failed"] },
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
});

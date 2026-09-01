import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { AeokitClient, clientFromEnvironment } from "./client.js";
import {
  apiToolsFromOpenApi,
  loadApiTools,
  type OpenApiDocument,
} from "./api-tools.js";

type ApiClient = Pick<AeokitClient, "request">;

export {
  apiToolsFromOpenApi,
  executeApiTool,
  loadApiTools,
} from "./api-tools.js";
export type {
  ApiTool,
  ApiToolClassification,
  ApiToolInput,
  OpenApiDocument,
} from "./api-tools.js";

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent:
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : { value },
  };
}

export async function createAeokitMcpServer(
  client: ApiClient = clientFromEnvironment(),
  document?: OpenApiDocument,
) {
  const server = new McpServer(
    { name: "aeokit", version: "0.1.0" },
    {
      instructions:
        "Use AeoKit to inspect auditable AI visibility data. Read existing evidence before suggesting changes. Confirm state-changing or cost-bearing operations with the user before calling them.",
    },
  );

  // Stable compatibility tools are intentionally retained alongside generated tools.
  server.registerTool(
    "aeokit_health",
    {
      description: "Check whether the configured AeoKit runtime is healthy.",
      annotations: { readOnlyHint: true },
    },
    async () => result(await client.request("/api/health")),
  );
  server.registerTool(
    "aeokit_list_projects",
    {
      description: "List projects available to the authenticated workspace.",
      annotations: { readOnlyHint: true },
    },
    async () => result(await client.request("/api/projects")),
  );
  server.registerTool(
    "aeokit_get",
    {
      description:
        "Read an AeoKit API path. Prefer a generated operation tool when one is available.",
      inputSchema: z.object({
        path: z
          .string()
          .regex(/^\/api(?:\/|$)/)
          .refine((path) => !path.includes("#") && !path.includes("://"), {
            message: "path must be a relative AeoKit /api path",
          })
          .describe("An AeoKit API path beginning with /api/"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ path }) => result(await client.request(path)),
  );

  const tools = document
    ? apiToolsFromOpenApi(document, client)
    : await loadApiTools(client);
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (input) => result(await tool.execute(input)),
    );
  }
  return server;
}

export function createAeokitMcpHttpHandler(
  factory: (
    request: Request,
  ) =>
    | { client: ApiClient; document: OpenApiDocument }
    | Promise<{ client: ApiClient; document: OpenApiDocument }>,
) {
  return createMcpHandler(
    async ({ requestInfo }) => {
      if (!requestInfo) throw new Error("MCP HTTP request context is missing");
      const { client, document } = await factory(requestInfo);
      return createAeokitMcpServer(client, document);
    },
    { legacy: "stateless", responseMode: "auto" },
  );
}

export function serveAeokitMcp() {
  return serveStdio(() => createAeokitMcpServer());
}

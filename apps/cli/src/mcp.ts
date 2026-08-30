import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { AeokitClient, clientFromEnvironment } from "./client.js";

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent:
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : { value },
  };
}

export function createAeokitMcpServer(
  client: AeokitClient = clientFromEnvironment(),
) {
  const server = new McpServer(
    { name: "aeokit", version: "0.1.0" },
    {
      instructions:
        "Use Aeokit to inspect auditable AI visibility data. Read existing evidence before suggesting changes.",
    },
  );

  server.registerTool(
    "aeokit_health",
    { description: "Check whether the configured Aeokit runtime is healthy." },
    async () => result(await client.request("/api/health")),
  );
  server.registerTool(
    "aeokit_list_projects",
    { description: "List projects available to the authenticated workspace." },
    async () => result(await client.request("/api/projects")),
  );
  server.registerTool(
    "aeokit_get",
    {
      description: "Read a JSON endpoint from the Aeokit API.",
      inputSchema: z.object({
        path: z
          .string()
          .startsWith("/api/")
          .describe("An Aeokit API path beginning with /api/"),
      }),
    },
    async ({ path }) => result(await client.request(path)),
  );
  return server;
}

export function serveAeokitMcp() {
  return serveStdio(() => createAeokitMcpServer());
}

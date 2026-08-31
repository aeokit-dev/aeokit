import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { AeokitClient, clientFromEnvironment } from "./client.js";

type OpenApiParameter = {
  name?: string;
  in?: string;
  description?: string;
};

type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: { required?: boolean };
  "x-aeokit-mcp"?: {
    confirmation?: string;
    cost?: boolean;
    destructive?: boolean;
  };
};

type OpenApiDocument = {
  paths?: Record<string, Record<string, OpenApiOperation>>;
};

type ToolInput = Record<string, unknown> & {
  query?: Record<string, unknown>;
  body?: unknown;
};

const methods = ["get", "post", "put", "patch", "delete"] as const;
const queryValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent:
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : { value },
  };
}

function appendQuery(path: string, query: Record<string, unknown> | undefined) {
  const parameters = new URLSearchParams();
  for (const [name, rawValue] of Object.entries(query ?? {})) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (["string", "number", "boolean"].includes(typeof value)) {
        parameters.append(name, String(value));
      }
    }
  }
  const encoded = parameters.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export function apiToolsFromOpenApi(
  document: OpenApiDocument,
  client: Pick<AeokitClient, "request">,
) {
  const tools = [];
  const names = new Set<string>();

  for (const [pathTemplate, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathTemplate.startsWith("/api/")) continue;
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation?.operationId) continue;
      const name = `aeokit_${operation.operationId}`;
      if (names.has(name)) throw new Error(`duplicate MCP tool name '${name}'`);
      names.add(name);

      const shape: Record<string, z.ZodType> = {};
      for (const parameter of operation.parameters ?? []) {
        if (parameter.in !== "path" || !parameter.name) continue;
        shape[parameter.name] = z
          .string()
          .describe(
            parameter.description ?? `${parameter.name} path parameter`,
          );
      }
      shape.query = z
        .record(z.string(), queryValue)
        .optional()
        .describe("Optional API query parameters");
      if (operation.requestBody) {
        shape.body = z
          .json()
          .describe("JSON request body from the current OpenAPI contract");
      }

      const metadata = operation["x-aeokit-mcp"];
      const readOnly = method === "get";
      const safety = metadata?.confirmation
        ? ` ${metadata.confirmation}`
        : readOnly
          ? ""
          : " This operation changes AeoKit state.";
      const description = `${operation.summary ?? operation.description ?? `${method.toUpperCase()} ${pathTemplate}`}.${safety}`;

      tools.push({
        name,
        description,
        inputSchema: z.object(shape),
        annotations: {
          readOnlyHint: readOnly,
          destructiveHint: metadata?.destructive ?? method === "delete",
          idempotentHint: ["get", "put", "delete"].includes(method),
          openWorldHint: metadata?.cost ?? false,
        },
        async execute(input: ToolInput) {
          let requestPath = pathTemplate;
          for (const parameter of operation.parameters ?? []) {
            if (parameter.in !== "path" || !parameter.name) continue;
            requestPath = requestPath.replace(
              `{${parameter.name}}`,
              encodeURIComponent(String(input[parameter.name])),
            );
          }
          requestPath = appendQuery(requestPath, input.query);
          return client.request(requestPath, {
            method: method.toUpperCase(),
            ...(operation.requestBody
              ? { body: JSON.stringify(input.body) }
              : {}),
          });
        },
      });
    }
  }

  return tools;
}

export async function createAeokitMcpServer(
  client: AeokitClient = clientFromEnvironment(),
) {
  const server = new McpServer(
    { name: "aeokit", version: "0.1.0" },
    {
      instructions:
        "Use AeoKit to inspect auditable AI visibility data. Read existing evidence before suggesting changes. Confirm state-changing or cost-bearing operations with the user before calling them.",
    },
  );

  const openapi = await client.request<OpenApiDocument>("/openapi.json");
  for (const tool of apiToolsFromOpenApi(openapi, client)) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (input) => result(await tool.execute(input as ToolInput)),
    );
  }

  server.registerTool(
    "aeokit_get",
    {
      description:
        "Read an AeoKit API path. Prefer a generated operation tool when one is available.",
      inputSchema: z.object({
        path: z
          .string()
          .startsWith("/api/")
          .describe("An AeoKit API path beginning with /api/"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ path }) => result(await client.request(path)),
  );
  return server;
}

export function serveAeokitMcp() {
  return serveStdio(() => createAeokitMcpServer());
}

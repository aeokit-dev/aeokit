interface RuntimeRoute {
  method: string;
  path: string;
}

function openApiPath(path: string): string {
  return path.replace(/:([^/]+)/g, "{$1}");
}

function pathParameters(path: string) {
  return [...path.matchAll(/:([^/]+)/g)].map((match) => ({
    name: match[1]!,
    in: "path" as const,
    required: true,
    schema: {
      type: "string" as const,
      ...(match[1]!.toLowerCase().endsWith("id")
        ? { format: "uuid" as const }
        : {}),
    },
  }));
}

function operationId(method: string, path: string): string {
  return `${method.toLowerCase()}${path
    .replace(/^\/api/, "")
    .replace(/:([^/]+)/g, " by $1")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("")}`;
}

function tagFor(path: string): string {
  return path.replace(/^\/api\/?/, "").split("/")[0] || "Runtime";
}

function summaryFor(method: string, path: string): string {
  const resource = path
    .replace(/^\/api\/?/, "")
    .replace(/:([^/]+)/g, "{$1}")
    .replaceAll("/", " ");
  return `${method[0]}${method.slice(1).toLowerCase()} ${resource || "runtime"}`;
}

export function createOpenApiDocument(routes: readonly RuntimeRoute[]) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    if (!route.path.startsWith("/api") || route.method === "ALL") continue;
    const path = openApiPath(route.path);
    const method = route.method.toLowerCase();
    const parameters = pathParameters(route.path);
    const acceptsBody = ["post", "put", "patch"].includes(method);

    paths[path] ??= {};
    paths[path]![method] = {
      operationId: operationId(route.method, route.path),
      summary: summaryFor(route.method, route.path),
      tags: [tagFor(route.path)],
      ...(parameters.length ? { parameters } : {}),
      ...(acceptsBody
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": { schema: { type: "object" } },
              },
            },
          }
        : {}),
      responses: {
        "200": {
          description: "Successful response",
          content: {
            "application/json": { schema: { type: "object" } },
          },
        },
        "400": { description: "Invalid request" },
        "404": { description: "Resource not found" },
        "500": { description: "Runtime error" },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Aeokit Runtime API",
      version: "0.1.0",
      description:
        "Headless API for projects, prompts, provider runs, citations, visibility, and AEO analysis.",
    },
    servers: [{ url: "/", description: "Current runtime" }],
    paths,
  };
}

export function apiReferenceHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aeokit Runtime API</title>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}

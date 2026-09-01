import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { apiReferenceHtml, createOpenApiDocument } from "./openapi";
import { createApiRoutes } from "./routes";
import { bearerToken, verifyApiKey } from "@aeokit/auth";
import { AeokitApiError, type AeokitClient } from "@aeokit/cli";
import {
  createAeokitMcpHttpHandler,
  type OpenApiDocument,
} from "@aeokit/cli/mcp";
import { serveProductUi } from "./web-ui";

export type RuntimeAuthConfig =
  { mode: "none" } | { mode: "api-key"; keyHashes: readonly string[] };

function environmentAuth(): RuntimeAuthConfig {
  if (process.env.AEOKIT_AUTH_MODE !== "api-key") return { mode: "none" };
  return {
    mode: "api-key",
    keyHashes: (process.env.AEOKIT_API_KEY_HASHES ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function createRuntimeApp(options: { auth?: RuntimeAuthConfig } = {}) {
  const app = new Hono();
  const auth = options.auth ?? environmentAuth();

  app.use(logger());
  app.use(
    "/api/*",
    cors({
      origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "MCP-Protocol-Version",
        "MCP-Session-Id",
        "Last-Event-ID",
      ],
    }),
  );
  app.use("/api/*", async (context, next) => {
    if (auth.mode === "none" || context.req.path === "/api/health") {
      return next();
    }
    const key = bearerToken(context.req.header("Authorization") ?? null);
    if (!key || !(await verifyApiKey(key, auth.keyHashes))) {
      return context.json({ error: "A valid bearer API key is required" }, 401);
    }
    return next();
  });
  app.route("/api", createApiRoutes());
  const mcp = createAeokitMcpHttpHandler(async (request) => ({
    document: createOpenApiDocument(app.routes) as OpenApiDocument,
    client: {
      async request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const headers = new Headers(init.headers);
        headers.set("Accept", "application/json");
        if (init.body) headers.set("Content-Type", "application/json");
        const authorization = request.headers.get("Authorization");
        if (authorization) headers.set("Authorization", authorization);
        const response = await app.request(new URL(path, request.url), {
          ...init,
          headers,
        });
        const payload = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (!response.ok) {
          throw new AeokitApiError(
            typeof payload?.error === "string"
              ? payload.error
              : `Aeokit request failed (${response.status})`,
            response.status,
          );
        }
        return payload as T;
      },
    } satisfies Pick<AeokitClient, "request">,
  }));
  app.all("/api/mcp", (context) => mcp.fetch(context.req.raw));
  app.get("/openapi.json", (context) =>
    context.json(createOpenApiDocument(app.routes)),
  );
  app.get("/docs", (context) => context.html(apiReferenceHtml()));
  app.get("/app", serveProductUi);
  app.get("/app/*", serveProductUi);
  app.get("/", (context) =>
    context.json({
      name: "aeokit",
      mode: "headless",
      health: "/api/health",
      api: "/api",
      docs: "/docs",
      openapi: "/openapi.json",
      mcp: "/api/mcp",
      ui: "/app",
    }),
  );
  app.notFound((context) => context.json({ error: "Not found" }, 404));
  app.onError((error, context) => {
    console.error(error);
    return context.json(
      { error: error.message || "Internal server error" },
      500,
    );
  });

  return app;
}

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { apiReferenceHtml, createOpenApiDocument } from "./openapi";
import { createApiRoutes } from "./routes";

export function createRuntimeApp() {
  const app = new Hono();

  app.use(logger());
  app.use(
    "/api/*",
    cors({
      origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.route("/api", createApiRoutes());
  app.get("/openapi.json", (context) =>
    context.json(createOpenApiDocument(app.routes)),
  );
  app.get("/docs", (context) => context.html(apiReferenceHtml()));
  app.get("/", (context) =>
    context.json({
      name: "aeokit",
      mode: "headless",
      health: "/api/health",
      api: "/api",
      docs: "/docs",
      openapi: "/openapi.json",
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

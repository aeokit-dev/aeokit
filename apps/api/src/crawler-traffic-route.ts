import { Hono } from "hono";
import { z } from "zod";
import {
  publicCrawlerTrafficError,
  type CrawlerTrafficData,
} from "@openaeo/cloudflare-analytics";

interface CrawlerTrafficRouteDependencies {
  findProject: (
    projectId: string,
  ) => Promise<{ website: string } | null | undefined>;
  getCrawlerTraffic: (website: string) => Promise<CrawlerTrafficData>;
}

export function createCrawlerTrafficRoutes(
  dependencies: CrawlerTrafficRouteDependencies,
) {
  const routes = new Hono();

  routes.get("/projects/:projectId/crawler-traffic", async (context) => {
    const projectId = context.req.param("projectId");
    if (!z.string().uuid().safeParse(projectId).success) {
      return context.json({ error: "Invalid project ID" }, 400);
    }
    const project = await dependencies.findProject(projectId);
    if (!project) return context.json({ error: "Project not found" }, 404);

    try {
      return context.json(
        await dependencies.getCrawlerTraffic(project.website),
      );
    } catch (error) {
      const response = publicCrawlerTrafficError(error);
      return context.json(response.body, response.status);
    }
  });

  return routes;
}

import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  citations,
  db,
  projects,
  promptRuns,
  prompts,
  reportRedirects,
} from "@aeokit/db";
import {
  buildPublicReport,
  renderPublicReportHtml,
  slugify,
} from "./public-report";

export async function loadPublicReport(project: typeof projects.$inferSelect) {
  const runs = await db
    .select({
      provider: promptRuns.provider,
      model: promptRuns.model,
      brandMentioned: promptRuns.brandMentioned,
      answer: promptRuns.answer,
      costUsd: promptRuns.costUsd,
      completedAt: promptRuns.completedAt,
      prompt: prompts.value,
      competitorsMentioned: promptRuns.competitorsMentioned,
      status: promptRuns.status,
    })
    .from(promptRuns)
    .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
    .where(eq(prompts.projectId, project.id))
    .orderBy(desc(promptRuns.completedAt))
    .limit(500);
  const cites = await db
    .select({
      url: citations.url,
      domain: citations.domain,
      title: citations.title,
    })
    .from(citations)
    .innerJoin(promptRuns, eq(citations.runId, promptRuns.id))
    .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
    .where(eq(prompts.projectId, project.id))
    .limit(100);
  return buildPublicReport(project, runs, cites);
}

async function reportFor(category: string, slug: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.reportSlug, slug),
  });
  if (
    !project?.reportPublishedAt ||
    !project.category ||
    !project.reportSlug ||
    slugify(project.category) !== category
  )
    return null;
  return loadPublicReport(project);
}

export function createPublicReportRoutes() {
  const app = new Hono();
  app.get("/methodology/v1", (c) =>
    c.html(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AeoKit visibility methodology v1</title><meta name="description" content="How AeoKit measures AI visibility, coverage, retries, failures, and limitations."></head><body><main><h1>AeoKit visibility methodology v1</h1><p>Visibility and mention rate use successful provider answers in the displayed measurement window. Failed attempts and retries are excluded from the denominator but provider coverage and sample size disclose the resulting evidence base.</p><h2>Collection and retries</h2><p>Each tracked prompt runs against its configured provider and model. Transient failures may be retried; only a successful final answer contributes measured evidence.</p><h2>Scoring and limitations</h2><p>Mention rate is the percentage of successful answers mentioning the tracked brand. Share of voice compares observed brand and competitor mentions. Results are samples, not universal estimates, and can vary as models, search indexes, prompts, and provider behavior change.</p></main></body></html>',
    ),
  );
  app.get("/reports/:category/:slug", async (c) => {
    const report = await reportFor(
      c.req.param("category"),
      c.req.param("slug"),
    );
    if (!report) {
      const [redirect] = await db
        .select({
          category: projects.category,
          slug: projects.reportSlug,
          publishedAt: projects.reportPublishedAt,
        })
        .from(reportRedirects)
        .innerJoin(projects, eq(reportRedirects.projectId, projects.id))
        .where(
          and(
            eq(reportRedirects.categorySlug, c.req.param("category")),
            eq(reportRedirects.reportSlug, c.req.param("slug")),
          ),
        )
        .limit(1);
      if (redirect?.publishedAt && redirect.category && redirect.slug)
        return c.redirect(
          `/reports/${slugify(redirect.category)}/${redirect.slug}`,
          301,
        );
      return c.text("Report not found", 404);
    }
    const origin = new URL(c.req.url).origin;
    return c.html(renderPublicReportHtml(report, origin));
  });
  app.get("/sitemap.xml", async (c) => {
    const rows = await db.select().from(projects);
    const origin = new URL(c.req.url).origin;
    const eligible = (
      await Promise.all(
        rows
          .filter((p) => p.reportPublishedAt && p.category && p.reportSlug)
          .map((p) => reportFor(slugify(p.category!), p.reportSlug!)),
      )
    ).filter((r) => r?.indexable);
    const urls = eligible
      .map(
        (r) =>
          `<url><loc>${origin}${r!.path}</loc><lastmod>${r!.updatedAt.toISOString()}</lastmod></url>`,
      )
      .join("");
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
      200,
      { "Content-Type": "application/xml" },
    );
  });
  return app;
}

import {
  CloudflareCrawlerTrafficClient,
  syncCrawlerTrafficHistory,
  type CrawlerTrafficHistoryStore,
} from "@openaeo/cloudflare-analytics";
import { crawlerTrafficDaily, db, projects } from "@openaeo/db";
import { and, inArray } from "drizzle-orm";

const crawlerTrafficClient = new CloudflareCrawlerTrafficClient();

const historyStore: CrawlerTrafficHistoryStore = {
  listProjects: () =>
    db.select({ id: projects.id, website: projects.website }).from(projects),
  listExisting: (projectIds, dates) =>
    db
      .select({
        projectId: crawlerTrafficDaily.projectId,
        date: crawlerTrafficDaily.date,
      })
      .from(crawlerTrafficDaily)
      .where(
        and(
          inArray(crawlerTrafficDaily.projectId, projectIds),
          inArray(crawlerTrafficDaily.date, dates),
        ),
      ),
  save: async (snapshot) => {
    await db
      .insert(crawlerTrafficDaily)
      .values({
        projectId: snapshot.projectId,
        date: snapshot.date,
        startAt: new Date(snapshot.start),
        endAt: new Date(snapshot.end),
        totalRequests: snapshot.totalRequests,
        identifiedCrawlerRequests: snapshot.identifiedCrawlerRequests,
        families: snapshot.families,
      })
      .onConflictDoUpdate({
        target: [crawlerTrafficDaily.projectId, crawlerTrafficDaily.date],
        set: {
          startAt: new Date(snapshot.start),
          endAt: new Date(snapshot.end),
          totalRequests: snapshot.totalRequests,
          identifiedCrawlerRequests: snapshot.identifiedCrawlerRequests,
          families: snapshot.families,
          updatedAt: new Date(),
        },
      });
  },
};

export function syncPostgresCrawlerHistory(now = new Date()) {
  return syncCrawlerTrafficHistory({
    store: historyStore,
    client: crawlerTrafficClient,
    token: process.env.CLOUDFLARE_API_TOKEN,
    now,
    days: 7,
  });
}

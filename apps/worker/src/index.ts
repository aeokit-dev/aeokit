import { PgBoss } from "pg-boss";
import { closeDatabase } from "@aeokit/db";
import { processPromptJobs, providerMaxAttempts } from "./process-prompt";
import { createScheduleHandler } from "./schedule";
import {
  markWorkerReady,
  markWorkerStopped,
  recordWorkerHeartbeat,
} from "./health";
import { recoverStaleRuns } from "./recovery";
import { syncPostgresCrawlerHistory } from "./crawler-history";
import { repairPostgresGoogleRedirectCitations } from "./citation-backfill";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const heartbeatIntervalMs = positiveInteger(
  process.env.WORKER_HEARTBEAT_INTERVAL_MS,
  15_000,
);
const staleAfterMs = positiveInteger(
  process.env.RUN_STALE_AFTER_MS,
  10 * 60_000,
);
const recoveryIntervalMs = positiveInteger(
  process.env.STALE_RECOVERY_INTERVAL_MS,
  60_000,
);

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://openaeo:openaeo@localhost:5433/openaeo";
const boss = new PgBoss({ connectionString, schema: "pgboss" });
boss.on("error", (error) => console.error("Queue error", error));

await boss.start();
await boss.createQueue("run-prompt", {
  retryLimit: 1,
  retryDelay: 60,
  expireInSeconds: 30 * 60,
});
await boss.createQueue("schedule-prompts", {
  retryLimit: 3,
  retryDelay: 30,
  expireInSeconds: 5 * 60,
});
await boss.createQueue("sync-crawler-traffic", {
  retryLimit: 3,
  retryDelay: 60,
  expireInSeconds: 10 * 60,
});
await boss.createQueue("repair-citation-redirects", {
  retryLimit: 3,
  retryDelay: 60,
  expireInSeconds: 10 * 60,
});
await boss.schedule(
  "schedule-prompts",
  "*/5 * * * *",
  { source: "cron" },
  { tz: "UTC" },
);
await boss.schedule(
  "sync-crawler-traffic",
  "15 0 * * *",
  { source: "daily" },
  { tz: "UTC" },
);
await boss.schedule(
  "repair-citation-redirects",
  "25 0 * * *",
  { source: "daily" },
  { tz: "UTC" },
);
await boss.send(
  "repair-citation-redirects",
  { source: "startup" },
  { singletonKey: "citation-redirect-repair", singletonSeconds: 5 * 60 },
);
if (process.env.CLOUDFLARE_API_TOKEN?.trim()) {
  await boss.send(
    "sync-crawler-traffic",
    { source: "startup" },
    { singletonKey: "crawler-history-sync", singletonSeconds: 5 * 60 },
  );
}
await markWorkerReady();

let recoveryRunning = false;
async function runRecoverySweep() {
  if (recoveryRunning) return;
  recoveryRunning = true;
  try {
    const recovered = await recoverStaleRuns(boss, {
      staleAfterMs,
      maxAttempts: providerMaxAttempts,
    });
    if (recovered > 0)
      console.log(`Queued ${recovered} stale run(s) to resume`);
  } catch (error) {
    console.error("Stale-run recovery failed", error);
  } finally {
    recoveryRunning = false;
  }
}

await runRecoverySweep();
await boss.work("run-prompt", { localConcurrency: 4 }, processPromptJobs);
await boss.work(
  "schedule-prompts",
  { localConcurrency: 1 },
  createScheduleHandler(boss),
);
await boss.work("sync-crawler-traffic", { localConcurrency: 1 }, async () => {
  const result = await syncPostgresCrawlerHistory();
  if (result.imported || result.failed) {
    console.log(
      `Crawler history imported ${result.imported} day(s); ${result.failed} failed`,
    );
  }
  if (result.failed) {
    throw new Error(`Crawler history sync failed for ${result.failed} day(s)`);
  }
});
await boss.work(
  "repair-citation-redirects",
  { localConcurrency: 1 },
  async () => {
    const result = await repairPostgresGoogleRedirectCitations();
    if (result.scanned) {
      console.log(
        `Citation redirects repaired ${result.repaired}; ${result.unresolved} unresolved`,
      );
    }
  },
);

const heartbeatTimer = setInterval(() => {
  void recordWorkerHeartbeat().catch((error) =>
    console.error("Worker heartbeat failed", error),
  );
}, heartbeatIntervalMs);
const recoveryTimer = setInterval(() => {
  void runRecoverySweep();
}, recoveryIntervalMs);

console.log("aeokit worker is ready");

async function shutdown() {
  clearInterval(heartbeatTimer);
  clearInterval(recoveryTimer);
  await markWorkerStopped().catch((error) =>
    console.error("Could not mark worker stopped", error),
  );
  await boss.stop({ graceful: true, timeout: 30_000 });
  await closeDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

import { PgBoss } from "pg-boss";

let queue: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (queue) return queue;
  queue = new PgBoss(
    process.env.DATABASE_URL ??
      "postgres://openaeo:openaeo@localhost:5433/openaeo",
  );
  queue.on("error", (error: Error) => console.error("Queue error", error));
  await queue.start();
  await queue.createQueue("run-prompt", {
    retryLimit: 1,
    retryDelay: 60,
    expireInSeconds: 30 * 60,
  });
  return queue;
}

export async function stopQueue(): Promise<void> {
  if (!queue) return;
  await queue.stop({ graceful: true, timeout: 10_000 });
  queue = null;
}

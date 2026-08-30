import { eq } from "drizzle-orm";
import { db, workerHeartbeats } from "@openaeo/db";

export const workerId = process.env.WORKER_ID || "primary";

export async function markWorkerReady(now = new Date()): Promise<void> {
  await db
    .insert(workerHeartbeats)
    .values({
      id: workerId,
      status: "ready",
      startedAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: workerHeartbeats.id,
      set: { status: "ready", startedAt: now, lastSeenAt: now },
    });
}

export async function recordWorkerHeartbeat(now = new Date()): Promise<void> {
  await db
    .update(workerHeartbeats)
    .set({ status: "ready", lastSeenAt: now })
    .where(eq(workerHeartbeats.id, workerId));
}

export async function markWorkerStopped(now = new Date()): Promise<void> {
  await db
    .update(workerHeartbeats)
    .set({ status: "stopped", lastSeenAt: now })
    .where(eq(workerHeartbeats.id, workerId));
}

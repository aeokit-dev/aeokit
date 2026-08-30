import type { PgBoss } from "pg-boss";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, promptRuns, prompts, promptTargets } from "@openaeo/db";
import type { RunPromptData, RunTargetData } from "./process-prompt";

export async function recoverStaleRuns(
  boss: PgBoss,
  {
    now = new Date(),
    staleAfterMs,
    maxAttempts,
  }: { now?: Date; staleAfterMs: number; maxAttempts: number },
): Promise<number> {
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const staleRuns = await db
    .select({ run: promptRuns, promptEnabled: prompts.enabled })
    .from(promptRuns)
    .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
    .where(
      and(
        inArray(promptRuns.status, ["running", "pending"]),
        sql`coalesce(${promptRuns.lastAttemptAt}, ${promptRuns.createdAt}) < ${cutoff.toISOString()}`,
      ),
    );

  let recovered = 0;
  for (const { run, promptEnabled } of staleRuns) {
    if (!promptEnabled || run.attemptCount >= maxAttempts) {
      await db
        .update(promptRuns)
        .set({
          status: "failed",
          error: promptEnabled
            ? `Worker stopped after ${run.attemptCount} of ${maxAttempts} attempts`
            : "Worker stopped and the prompt is now disabled",
          completedAt: now,
          dedupeKey: null,
        })
        .where(eq(promptRuns.id, run.id));
      continue;
    }

    const target = run.promptTargetId
      ? await db.query.promptTargets.findFirst({
          where: eq(promptTargets.id, run.promptTargetId),
        })
      : await db.query.promptTargets.findFirst({
          where: and(
            eq(promptTargets.promptId, run.promptId),
            eq(promptTargets.provider, run.provider),
            eq(promptTargets.model, run.model),
          ),
        });

    if (!target) {
      await db
        .update(promptRuns)
        .set({
          status: "failed",
          error:
            "Worker stopped and the original provider target no longer exists",
          completedAt: now,
          dedupeKey: null,
        })
        .where(eq(promptRuns.id, run.id));
      continue;
    }

    await db
      .update(promptRuns)
      .set({
        status: "pending",
        error: "Waiting to resume after a worker interruption",
        completedAt: null,
      })
      .where(eq(promptRuns.id, run.id));

    const runTarget: RunTargetData = {
      id: target.id,
      provider: target.provider,
      model: target.model,
      webSearch: target.webSearch,
    };
    const data: RunPromptData = {
      promptId: run.promptId,
      runId: run.id,
      target: runTarget,
    };
    try {
      await boss.send("run-prompt", data, {
        retryLimit: 1,
        singletonKey: `recovery-${run.id}`,
        singletonSeconds: Math.max(60, Math.ceil(staleAfterMs / 1_000)),
      });
      recovered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(promptRuns)
        .set({
          status: "failed",
          error: `Could not queue stale-run recovery: ${message}`,
          completedAt: now,
          dedupeKey: null,
        })
        .where(eq(promptRuns.id, run.id));
    }
  }
  return recovered;
}

import type { Job, PgBoss } from "pg-boss";
import { eq, sql } from "drizzle-orm";
import { db, promptRuns, prompts } from "@openaeo/db";

export interface ScheduleData {
  source?: string;
}

export function createScheduleHandler(boss: PgBoss) {
  return async function scheduleJobs(
    _jobs: Job<ScheduleData>[],
  ): Promise<void> {
    const duePrompts = await db
      .select({
        id: prompts.id,
        cadenceMinutes: prompts.cadenceMinutes,
        lastRunAt: sql<Date | null>`max(${promptRuns.createdAt})`,
      })
      .from(prompts)
      .leftJoin(promptRuns, eq(promptRuns.promptId, prompts.id))
      .where(eq(prompts.enabled, true))
      .groupBy(prompts.id, prompts.cadenceMinutes);

    const now = Date.now();
    for (const prompt of duePrompts) {
      const lastRunAt = prompt.lastRunAt
        ? new Date(prompt.lastRunAt).getTime()
        : 0;
      if (now - lastRunAt < prompt.cadenceMinutes * 60_000) continue;
      await boss.send(
        "run-prompt",
        { promptId: prompt.id },
        { singletonKey: `scheduled-${prompt.id}`, singletonSeconds: 5 * 60 },
      );
    }
  };
}

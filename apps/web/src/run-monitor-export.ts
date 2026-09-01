import type { MonitorRun, RunMonitorResponse } from "./types";

type RunMonitorRequest = (path: string) => Promise<RunMonitorResponse>;

export async function fetchAllRunMonitorRows(
  filters: URLSearchParams,
  request: RunMonitorRequest,
): Promise<MonitorRun[]> {
  const params = new URLSearchParams(filters);
  params.delete("page");
  params.set("pageSize", "100");
  const rows: MonitorRun[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (rows.length < total) {
    params.set("page", String(page));
    const response = await request(`/run-monitor?${params.toString()}`);
    total = response.total;
    rows.push(...response.runs);
    if (response.runs.length === 0) break;
    page += 1;
  }

  return rows.slice(0, total);
}

export function runMonitorCsv(rows: MonitorRun[]): string {
  const fields = [
    "projectName",
    "promptValue",
    "provider",
    "model",
    "status",
    "trigger",
    "batchId",
    "createdAt",
    "lastAttemptAt",
    "completedAt",
    "latencyMs",
    "attemptCount",
    "costUsd",
    "error",
  ] as const;

  return [
    fields.join(","),
    ...rows.map((run) =>
      fields.map((field) => JSON.stringify(run[field] ?? "")).join(","),
    ),
  ].join("\n");
}

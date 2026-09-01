import { queryOptions } from "@tanstack/react-query";
import { api, tenantQueryKey } from "./api";
import type { RunDetail } from "./types";

export const runDetailQueryKey = (runId: string | null) =>
  tenantQueryKey("run", runId);

export function runIdFromSearch(parameters: URLSearchParams): string | null {
  const runId = parameters.get("run")?.trim();
  return runId || null;
}

export function runDetailQueryOptions(runId: string | null) {
  return queryOptions({
    queryKey: runDetailQueryKey(runId),
    queryFn: ({ signal }) => {
      if (!runId) throw new Error("No run selected");
      return api<{ run: RunDetail }>(`/runs/${runId}`, { signal });
    },
    enabled: Boolean(runId),
  });
}

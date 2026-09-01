import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, tenantQueryKey } from "../api";
import { brandAppPath } from "../app-routing";
import { fetchAllRunMonitorRows, runMonitorCsv } from "../run-monitor-export";
import type { Project, RunMonitorResponse } from "../types";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  ProviderBadge,
  StatusBadge,
  formatDate,
  formatUsd,
  unknownValue,
} from "../components/ui";

export function RunMonitorPage({
  projects,
  appBasePath,
  showProviderCosts,
}: {
  projects: Project[];
  appBasePath: string;
  showProviderCosts: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryString = params.toString();
  const query = useQuery({
    queryKey: tenantQueryKey("run-monitor", queryString),
    queryFn: () =>
      api<RunMonitorResponse>(
        `/run-monitor${queryString ? `?${queryString}` : ""}`,
      ),
    refetchInterval: 5_000,
  });
  const mutate = useMutation({
    mutationFn: ({
      action,
      runIds,
    }: {
      action: "retry" | "cancel";
      runIds: string[];
    }) =>
      api(`/run-monitor/${action}`, {
        method: "POST",
        body: JSON.stringify({ runIds }),
      }),
    onSuccess: async () => {
      setSelected(new Set());
      await queryClient.invalidateQueries({
        queryKey: tenantQueryKey("run-monitor"),
      });
    },
  });
  const rows = query.data?.runs ?? [];
  const selectedRows = rows.filter((run) => selected.has(run.id));
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    next.delete("page");
    setParams(next);
  };
  const sortedRows = useMemo(() => {
    const sort = params.get("sort") ?? "createdAt";
    const direction = params.get("direction") === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) =>
        String(a[sort as keyof typeof a] ?? "").localeCompare(
          String(b[sort as keyof typeof b] ?? ""),
        ) * direction,
    );
  }, [rows, params]);
  const confirmRetry = () => {
    const failed = selectedRows.filter((run) => run.status === "failed");
    const estimate = failed.reduce((sum, run) => sum + (run.costUsd ?? 0), 0);
    if (
      failed.length &&
      window.confirm(
        `Retry ${failed.length} provider run${failed.length === 1 ? "" : "s"}? Estimated additional cost based on prior runs: ${formatUsd(estimate)}.`,
      )
    )
      mutate.mutate({ action: "retry", runIds: failed.map((run) => run.id) });
  };
  const confirmCancel = () => {
    const pending = selectedRows.filter((run) => run.status === "pending");
    if (
      pending.length &&
      window.confirm(
        `Cancel ${pending.length} queued provider run${pending.length === 1 ? "" : "s"}?`,
      )
    )
      mutate.mutate({ action: "cancel", runIds: pending.map((run) => run.id) });
  };
  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const exportRows = await fetchAllRunMonitorRows(params, (path) =>
        api<RunMonitorResponse>(path),
      );
      const csv = runMonitorCsv(exportRows);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      link.download = "run-monitor.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "The export could not be created",
      );
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="page-shell">
      <PageHeader
        title="Run Monitor"
        description="Organization-wide provider execution across every accessible brand."
        actions={
          <button
            className="btn btn-sm"
            onClick={() => void exportCsv()}
            disabled={exporting}
            aria-busy={exporting}
          >
            <Download className="size-4" />
            {exporting ? "Exporting…" : "Export all"}
          </button>
        }
      />
      {exportError ? (
        <div className="alert alert-error" role="alert">
          Export failed: {exportError}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          ["pending", "running", "succeeded", "failed", "cancelled"] as const
        ).map((status) => (
          <button
            key={status}
            className="stat rounded-lg border border-base-300 bg-base-100 text-left"
            onClick={() =>
              set("status", params.get("status") === status ? "" : status)
            }
          >
            <span className="stat-title capitalize">
              {status === "pending" ? "Queued" : status}
            </span>
            <span className="stat-value text-2xl">
              {query.isSuccess
                ? (query.data?.counts[status] ?? 0)
                : unknownValue}
            </span>
          </button>
        ))}
      </div>
      <section className="data-panel p-3">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <input
            className="input input-sm"
            placeholder="Search runs or errors"
            value={params.get("search") ?? ""}
            onChange={(e) => set("search", e.target.value)}
          />
          <select
            className="select select-sm"
            value={params.get("projectId") ?? ""}
            onChange={(e) => set("projectId", e.target.value)}
          >
            <option value="">All brands</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <input
            className="input input-sm"
            placeholder="Provider"
            value={params.get("provider") ?? ""}
            onChange={(e) => set("provider", e.target.value)}
          />
          <select
            className="select select-sm"
            value={params.get("trigger") ?? ""}
            onChange={(e) => set("trigger", e.target.value)}
          >
            <option value="">Manual + scheduled</option>
            <option value="manual">Manual</option>
            <option value="scheduled">Scheduled</option>
          </select>
          <input
            type="date"
            className="input input-sm"
            aria-label="From date"
            value={params.get("from") ?? ""}
            onChange={(e) => set("from", e.target.value)}
          />
          <input
            className="input input-sm"
            placeholder="Batch ID"
            value={params.get("batchId") ?? ""}
            onChange={(e) => set("batchId", e.target.value)}
          />
          <input
            className="input input-sm"
            placeholder="Prompt ID"
            value={params.get("promptId") ?? ""}
            onChange={(e) => set("promptId", e.target.value)}
          />
          <input
            type="date"
            className="input input-sm"
            aria-label="To date"
            value={params.get("to") ?? ""}
            onChange={(e) => set("to", e.target.value)}
          />
        </div>
      </section>
      {query.data?.batches.slice(0, 3).map((batch) => (
        <section
          key={batch.batchId}
          className="rounded-lg border border-base-300 p-3 text-sm"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-medium">
              Batch {batch.batchId.slice(0, 8)}
            </span>
            <span>
              {batch.completed} of {batch.total} completed · {batch.successRate}
              % success
              {showProviderCosts ? ` · ${formatUsd(batch.costUsd)}` : ""}
              {` · ${Math.round(batch.elapsedMs / 1000)}s elapsed`}
              {batch.estimatedRemainingMs === null
                ? ""
                : ` · ~${Math.round(batch.estimatedRemainingMs / 1000)}s remaining`}
            </span>
          </div>
          <progress
            className="progress progress-primary mt-2 w-full"
            value={batch.completed}
            max={batch.total}
          />
        </section>
      ))}
      {selected.size ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-base-200 p-3 text-sm">
          <strong>{selected.size} selected</strong>
          <button
            className="btn btn-sm"
            onClick={confirmRetry}
            disabled={!selectedRows.some((run) => run.status === "failed")}
          >
            <RefreshCw className="size-4" /> Retry failed
          </button>
          <button
            className="btn btn-sm"
            onClick={confirmCancel}
            disabled={!selectedRows.some((run) => run.status === "pending")}
          >
            <XCircle className="size-4" /> Cancel queued
          </button>
          {mutate.isError ? (
            <span className="text-error">
              {(mutate.error as Error).message}
            </span>
          ) : null}
        </div>
      ) : null}
      {query.isError ? (
        <ErrorState
          message={`Run monitor data could not be loaded. ${(query.error as Error).message}`}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.isPending ? (
        <LoadingBlock className="h-80" />
      ) : rows.length ? (
        <section className="data-panel overflow-x-auto">
          <table className="table table-sm min-w-[80rem]">
            <thead>
              <tr>
                <th></th>
                {(
                  [
                    ["projectName", "Brand"],
                    ["promptValue", "Prompt"],
                    ["provider", "Provider"],
                    ["status", "Status"],
                    ["createdAt", "Queued"],
                    ["lastAttemptAt", "Started"],
                    ["completedAt", "Completed"],
                    ["latencyMs", "Duration"],
                    ["attemptCount", "Retries"],
                    ["batchId", "Batch"],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key}>
                    <button
                      onClick={() => {
                        set("sort", key);
                        set(
                          "direction",
                          params.get("sort") === key &&
                            params.get("direction") !== "asc"
                            ? "asc"
                            : "desc",
                        );
                      }}
                    >
                      {label}
                    </button>
                  </th>
                ))}
                {showProviderCosts ? <th>Cost</th> : null}
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((run) => (
                <tr
                  key={run.id}
                  className="cursor-pointer hover:bg-base-200/40"
                  onClick={() =>
                    navigate(
                      `${brandAppPath(appBasePath, run.projectId, "/runs")}?run=${run.id}`,
                    )
                  }
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={selected.has(run.id)}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          next.has(run.id)
                            ? next.delete(run.id)
                            : next.add(run.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td>{run.projectName}</td>
                  <td className="max-w-xs truncate" title={run.promptValue}>
                    {run.promptValue}
                  </td>
                  <td>
                    <ProviderBadge provider={run.provider} model={run.model} />
                  </td>
                  <td>
                    <StatusBadge status={run.status} />
                  </td>
                  <td>{formatDate(run.createdAt)}</td>
                  <td>
                    {run.lastAttemptAt ? formatDate(run.lastAttemptAt) : "—"}
                  </td>
                  <td>{run.completedAt ? formatDate(run.completedAt) : "—"}</td>
                  <td>
                    {run.latencyMs
                      ? `${(run.latencyMs / 1000).toFixed(1)}s`
                      : "—"}
                  </td>
                  <td>{Math.max(0, run.attemptCount - 1)}</td>
                  <td className="font-mono text-xs">
                    {run.batchId?.slice(0, 8) ?? "—"}
                  </td>
                  {showProviderCosts ? <td>{formatUsd(run.costUsd)}</td> : null}
                  <td
                    className="max-w-xs truncate text-error"
                    title={run.error ?? ""}
                  >
                    {run.error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between p-3 text-sm">
            <span>
              {query.data.total} {query.data.total === 1 ? "run" : "runs"}
            </span>
            <div className="join">
              <button
                className="btn join-item btn-sm"
                disabled={query.data.page <= 1}
                onClick={() => set("page", String(query.data!.page - 1))}
              >
                Previous
              </button>
              <button
                className="btn join-item btn-sm"
                disabled={
                  query.data.page * query.data.pageSize >= query.data.total
                }
                onClick={() => set("page", String(query.data!.page + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      ) : (
        <EmptyState
          title="No runs match these filters"
          description="Try clearing filters, or launch a prompt to create a provider run."
        />
      )}
    </div>
  );
}

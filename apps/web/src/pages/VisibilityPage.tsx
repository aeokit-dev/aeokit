import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, CircleMinus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api, tenantQueryKey } from "../api";
import type { Project, Prompt } from "../types";
import { readQueryParam, updateQueryParam } from "../url-search-params";
import {
  EmptyState,
  ErrorState,
  unknownValue,
  LoadingBlock,
  PageHeader,
  ProviderBadge,
  formatRelative,
} from "../components/ui";

const periods = ["7d", "30d", "90d"] as const;

interface VisibilityRow {
  prompt: Prompt;
  visibility: number | null;
  mentionRate: number | null;
  citationRate: number | null;
  runs: number;
  attemptedRuns: number;
  successfulRuns: number;
  failedRuns: number;
  pendingRuns: number;
  runningRuns: number;
  usableCoveragePercentage: number;
  confidence: VisibilitySummary["confidence"];
  mentions: number;
  citedRuns: number;
  lastRunAt: string | null;
  providers: Array<{
    provider: string;
    model: string;
    visibility: number | null;
    mentionRate: number | null;
    citationRate: number | null;
    runs: number;
    attemptedRuns: number;
    successfulRuns: number;
    failedRuns: number;
    pendingRuns: number;
    runningRuns: number;
    usableCoveragePercentage: number;
  }>;
}

interface VisibilitySummary {
  rate: number | null;
  attemptedRuns: number;
  successfulRuns: number;
  failedRuns: number;
  pendingRuns: number;
  runningRuns: number;
  usableCoveragePercentage: number;
  confidence: {
    level: "none" | "low" | "medium" | "high";
    sampleSize: number;
    interval: { low: number; high: number } | null;
  };
}

interface VisibilityResponse {
  rows: VisibilityRow[];
  summary: VisibilitySummary;
  providerCoverage: {
    coveredSurfaces: number;
    totalSurfaces: number;
    percentage: number | null;
  };
}

function percentage(value: number | null): string {
  return value === null ? "Unknown" : `${value}%`;
}

export function VisibilityPage({ project }: { project: Project }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = readQueryParam(searchParams, "period", periods, "30d");
  const query = useQuery({
    queryKey: tenantQueryKey("visibility", project.id, period),
    queryFn: () =>
      api<VisibilityResponse>(
        `/projects/${project.id}/visibility?period=${period}`,
      ),
  });
  const rows = query.data?.rows ?? [];
  const summary = query.data?.summary;
  // Until the request resolves these are not zeros, they are unknown.
  const resolved = query.isSuccess;

  return (
    <div className="page-shell">
      <PageHeader
        title="Visibility"
        description="How often answer engines mention your brand versus cite one of your domains."
        actions={
          <select
            className="select select-sm border-base-300"
            value={period}
            onChange={(event) =>
              setSearchParams(
                updateQueryParam(
                  searchParams,
                  "period",
                  event.target.value,
                  "30d",
                ),
              )
            }
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="metric-card">
          <p className="text-sm text-base-content/50">Mention rate</p>
          <p className="mt-2 text-2xl font-semibold">
            {percentage(summary?.rate ?? null)}
          </p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-base-content/50">Attempted</p>
          <p className="mt-2 text-2xl font-semibold">
            {resolved ? (summary?.attemptedRuns ?? 0) : unknownValue}
          </p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-base-content/50">Successful</p>
          <p className="mt-2 text-2xl font-semibold">
            {resolved ? (summary?.successfulRuns ?? 0) : unknownValue}
          </p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-base-content/50">Failed</p>
          <p className="mt-2 text-2xl font-semibold">
            {resolved ? (summary?.failedRuns ?? 0) : unknownValue}
          </p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-base-content/50">Run coverage</p>
          <p className="mt-2 text-2xl font-semibold">
            {resolved
              ? `${summary?.usableCoveragePercentage ?? 0}%`
              : unknownValue}
          </p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-base-content/50">Provider coverage</p>
          <p className="mt-2 text-2xl font-semibold">
            {percentage(query.data?.providerCoverage.percentage ?? null)}
          </p>
          <p className="mt-1 text-xs text-base-content/40">
            {resolved
              ? `${query.data?.providerCoverage.coveredSurfaces ?? 0} / ${query.data?.providerCoverage.totalSurfaces ?? 0} surfaces`
              : `${unknownValue} surfaces`}
          </p>
        </div>
      </div>
      {summary?.confidence.level === "low" ||
      summary?.confidence.level === "none" ? (
        <div className="alert mb-4 border border-warning/30 bg-warning/10 text-sm text-base-content">
          <CircleAlert className="size-4 text-warning" />
          <span>
            {summary.confidence.level === "none"
              ? "Rates are Unknown because no run returned usable evidence."
              : `Low confidence: ${summary.successfulRuns} successful answers from ${summary.attemptedRuns} attempts${summary.confidence.interval ? `; the 95% mention-rate range is approximately ${summary.confidence.interval.low}–${summary.confidence.interval.high}%` : ""}.`}
          </span>
        </div>
      ) : null}
      {query.isError ? (
        <ErrorState
          message={`Visibility data could not be loaded. ${(query.error as Error).message}`}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}
      {query.isPending ? (
        <LoadingBlock className="h-80" />
      ) : query.isError ? null : (
        <section className="data-panel">
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-full">Prompt</th>
                    <th>Mention rate</th>
                    <th>Citation rate</th>
                    <th>Evidence</th>
                    <th>Providers</th>
                    <th>Last run</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.prompt.id} className="hover:bg-base-200/35">
                      <td>
                        <Link
                          to={`../runs?promptId=${row.prompt.id}`}
                          className="block max-w-2xl font-medium leading-5 hover:text-primary hover:underline"
                          title="View prompt run history"
                        >
                          {row.prompt.value}
                        </Link>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          {row.mentionRate === null ? (
                            <CircleMinus className="size-4 text-base-content/30" />
                          ) : row.mentionRate > 0 ? (
                            <CircleCheck className="size-4 text-success" />
                          ) : (
                            <CircleMinus className="size-4 text-base-content/30" />
                          )}
                          <span className="font-mono font-semibold">
                            {percentage(row.mentionRate)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          {row.citationRate !== null && row.citationRate > 0 ? (
                            <CircleCheck className="size-4 text-success" />
                          ) : (
                            <CircleMinus className="size-4 text-base-content/30" />
                          )}
                          <span className="font-mono font-semibold">
                            {percentage(row.citationRate)}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-base-content/55">
                        {row.mentions} mentioned · {row.citedRuns} cited /{" "}
                        {row.successfulRuns} successful · {row.failedRuns}{" "}
                        failed
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {row.providers.length ? (
                            row.providers.map((provider) => (
                              <span
                                key={`${provider.provider}:${provider.model}`}
                                title={`${percentage(provider.mentionRate)} mention rate · ${percentage(provider.citationRate)} citation rate · ${provider.successfulRuns}/${provider.attemptedRuns} successful`}
                              >
                                <ProviderBadge
                                  provider={provider.provider}
                                  model={provider.model}
                                />
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-base-content/40">
                              No data
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-base-content/50">
                        {formatRelative(row.lastRunAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No prompts tracked"
              description="Add a prompt, then run it to measure visibility."
            />
          )}
        </section>
      )}
    </div>
  );
}

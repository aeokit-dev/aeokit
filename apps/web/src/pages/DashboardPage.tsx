import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  Bot,
  CircleAlert,
  ChevronRight,
  Coins,
  DollarSign,
  Link2,
  Target,
  Search,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, tenantQueryKey } from "../api";
import type { DashboardData, Project, RunDetail } from "../types";
import { runDetailQueryOptions } from "../run-detail-query";
import { MarkdownAnswer } from "../components/MarkdownAnswer";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  ProviderBadge,
  StatusBadge,
  formatRelative,
  formatUsd,
  mentionOutcomeLabel,
} from "../components/ui";
import { CrawlerTrafficSummary } from "../components/CrawlerTrafficSection";
import {
  readQueryParam,
  readQueryText,
  updateQueryParam,
} from "../url-search-params";

const periods = ["7d", "30d", "90d"] as const;

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  to,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Target;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="metric-card group transition-colors hover:border-primary/35 hover:bg-primary/[0.025]"
      data-webmcp-insight={`dashboard-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      aria-label={label}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-base-content/55">
          {label}
        </span>
        <span className="rounded-md bg-base-200 p-1.5 text-base-content/45 group-hover:text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <p className="mt-1 text-xs text-base-content/45">{detail}</p>
    </Link>
  );
}

function percentage(value: number | null): string {
  return value === null ? "Unknown" : `${value}%`;
}

export function DashboardPage({
  project,
  showProviderCosts,
}: {
  project: Project;
  showProviderCosts: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = readQueryParam(searchParams, "period", periods, "30d");
  const runFilter = readQueryText(searchParams, "search");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: tenantQueryKey("dashboard", project.id, period),
    queryFn: () =>
      api<DashboardData>(`/projects/${project.id}/dashboard?period=${period}`),
    refetchInterval: 30_000,
  });
  const detailQuery = useQuery(runDetailQueryOptions(selectedRunId));
  const selectedRun =
    detailQuery.data?.run.id === selectedRunId ? detailQuery.data.run : null;
  const recentRuns = useMemo(() => {
    const normalized = runFilter.trim().toLowerCase();
    const runs = query.data?.recentRuns ?? [];
    if (!normalized) return runs;
    return runs.filter((run) =>
      [run.promptValue, run.provider, run.model, run.status]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [query.data?.recentRuns, runFilter]);

  return (
    <div className="page-shell">
      <PageHeader
        title="Dashboard"
        description={`AI visibility for ${project.name} across your tracked prompts and providers.`}
        actions={
          <select
            className="select select-sm border-base-300 bg-base-100"
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

      {query.isError ? (
        <ErrorState message={(query.error as Error).message} />
      ) : null}
      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: showProviderCosts ? 9 : 7 }, (_, item) => (
            <LoadingBlock key={item} className="h-32" />
          ))}
        </div>
      ) : query.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Mention rate"
              value={percentage(query.data.mentionRate)}
              detail={`${query.data.mentionConfidence.sampleSize} successful runs in the sample`}
              icon={Target}
              to="visibility"
            />
            <MetricCard
              label="Citation rate"
              value={percentage(query.data.citationRate)}
              detail={`${query.data.citedRuns} runs cited your domains · ${query.data.ownedCitations} owned citations`}
              icon={Link2}
              to="citations"
            />
            <MetricCard
              label="Successful runs"
              value={query.data.dataTrust.successfulRuns}
              detail={`${query.data.dataTrust.attemptedRuns} Attempted runs · ${query.data.dataTrust.usableCoveragePercentage}% produced usable answers`}
              icon={Bot}
              to="runs"
            />
            <MetricCard
              label="Provider coverage"
              value={percentage(query.data.providerCoverage.percentage)}
              detail={`${query.data.providerCoverage.coveredSurfaces} of ${query.data.providerCoverage.totalSurfaces} configured surfaces returned data`}
              icon={Bot}
              to="visibility"
            />
            {showProviderCosts ? (
              <>
                <MetricCard
                  label="Overall spend"
                  value={formatUsd(query.data.overallCostUsd ?? 0)}
                  detail={
                    query.data.overallCostedRuns
                      ? `${query.data.overallCostedRuns} priced runs across all time`
                      : "No exact costs reported yet"
                  }
                  icon={Coins}
                  to="runs"
                />
                <MetricCard
                  label="Period spend"
                  value={formatUsd(query.data.totalCostUsd ?? 0)}
                  detail={
                    query.data.costedRuns
                      ? `${query.data.costedRuns} priced runs in this period`
                      : "No exact costs in this period"
                  }
                  icon={DollarSign}
                  to="runs"
                />
              </>
            ) : null}
          </div>

          {query.data.mentionConfidence.level === "low" ||
          query.data.mentionConfidence.level === "none" ? (
            <div className="alert mt-4 border border-warning/30 bg-warning/10 text-sm text-base-content">
              <CircleAlert className="size-4 text-warning" />
              <span>
                {query.data.mentionConfidence.level === "none"
                  ? "Mention rate is Unknown because no run returned usable evidence."
                  : `Low confidence: ${query.data.dataTrust.successfulRuns} of ${query.data.dataTrust.attemptedRuns} attempted runs succeeded${query.data.mentionConfidence.interval ? `; the 95% range is approximately ${query.data.mentionConfidence.interval.low}–${query.data.mentionConfidence.interval.high}%` : ""}. Provider failures may bias the result.`}
              </span>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
            <section className="data-panel p-4">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold leading-tight">
                    Visibility trend
                  </h2>
                  <p className="mt-0.5 text-xs text-base-content/45">
                    Share of successful answers that mention {project.name}
                  </p>
                </div>
                <Activity className="size-4 text-base-content/35" />
              </div>
              {query.data.trend.length ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={query.data.trend}
                      margin={{ left: -18, right: 8, top: 8, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="visibilityFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="var(--color-primary)"
                            stopOpacity={0.28}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--color-primary)"
                            stopOpacity={0.03}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="currentColor"
                        opacity={0.1}
                      />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fontSize: 11,
                          fill: "currentColor",
                          opacity: 0.45,
                        }}
                        tickFormatter={(value: string) =>
                          new Date(`${value}T00:00:00`).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )
                        }
                      />
                      <YAxis
                        domain={[0, 100]}
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fontSize: 11,
                          fill: "currentColor",
                          opacity: 0.45,
                        }}
                        tickFormatter={(value: number) => `${value}%`}
                      />
                      <Tooltip
                        formatter={(value) => [
                          value === null || value === undefined
                            ? "Unknown"
                            : `${value}%`,
                          "Mention rate",
                        ]}
                        labelFormatter={(value) =>
                          new Date(`${value}T00:00:00`).toLocaleDateString()
                        }
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid var(--color-base-300)",
                          background: "var(--color-base-100)",
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="visibility"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        fill="url(#visibilityFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No visibility data yet"
                  description="Run a prompt to start building your visibility trend."
                />
              )}
            </section>

            <section className="data-panel p-4">
              <div className="mb-4">
                <h2 className="text-base font-semibold leading-tight">
                  Needs attention
                </h2>
                <p className="mt-0.5 text-xs text-base-content/45">
                  Signals worth investigating now
                </p>
              </div>
              <div className="space-y-2">
                <Link
                  to="runs"
                  aria-label="Failed runs"
                  className="flex items-center gap-3 rounded-lg border border-base-300 p-3 hover:bg-base-200/45"
                >
                  <CircleAlert className="size-5 shrink-0 text-error" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {query.data.dataTrust.failedRuns} failed runs
                    </span>
                    <span className="block text-xs text-base-content/45">
                      {query.data.dataTrust.attemptedRuns} Attempted runs ·{" "}
                      {query.data.dataTrust.usableCoveragePercentage}% produced
                      usable answers
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-base-content/35" />
                </Link>
                <Link
                  to="visibility"
                  className="flex items-center gap-3 rounded-lg border border-base-300 p-3 hover:bg-base-200/45"
                >
                  <Bot className="size-5 shrink-0 text-warning" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {query.data.providerCoverage.totalSurfaces -
                        query.data.providerCoverage.coveredSurfaces}{" "}
                      providers without coverage
                    </span>
                    <span className="block text-xs text-base-content/45">
                      {percentage(query.data.providerCoverage.percentage)}{" "}
                      provider coverage
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-base-content/35" />
                </Link>
                <Link
                  to="citations"
                  className="flex items-center gap-3 rounded-lg border border-base-300 p-3 hover:bg-base-200/45"
                >
                  <Link2 className="size-5 shrink-0 text-info" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {query.data.mentionConfidence.level === "high"
                        ? "Citation opportunities"
                        : query.data.citedRuns === 0
                          ? "Unknown citation confidence"
                          : "Low citation confidence"}
                    </span>
                    <span className="block text-xs text-base-content/45">
                      {query.data.citedRuns === 0 ? (
                        <>
                          <span className="block">
                            {query.data.ownedCitations} owned citations across{" "}
                            {query.data.citedRuns} runs
                          </span>
                          <span className="block">
                            Run a prompt to collect your first citation evidence
                          </span>
                        </>
                      ) : (
                        `${query.data.ownedCitations} owned citations across ${query.data.citedRuns} runs`
                      )}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-base-content/35" />
                </Link>
              </div>
            </section>
          </div>

          <section className="data-panel mt-4">
            <div className="flex flex-col gap-3 border-b border-base-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold leading-tight">
                  Recent runs
                </h2>
                <p className="mt-0.5 text-xs text-base-content/45">
                  Latest answers from configured providers
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="input input-sm flex min-w-52 items-center gap-2 border-base-300 bg-base-100">
                  <Search className="size-3.5 text-base-content/40" />
                  <input
                    aria-label="Filter recent runs"
                    className="min-w-0"
                    placeholder="Filter recent runs"
                    value={runFilter}
                    onChange={(event) =>
                      setSearchParams(
                        updateQueryParam(
                          searchParams,
                          "search",
                          event.target.value,
                        ),
                      )
                    }
                  />
                </label>
                <Link to="runs" className="btn btn-ghost btn-sm text-xs">
                  View all <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>
            {recentRuns.length ? (
              <div className="overflow-x-auto">
                <table className="table table-sm min-w-[52rem]">
                  <thead>
                    <tr>
                      <th>Prompt</th>
                      <th>Provider</th>
                      <th>Status</th>
                      <th>Brand mention</th>
                      <th>Run time</th>
                      {showProviderCosts ? <th>Cost</th> : null}
                      <th>Ran</th>
                      <th>
                        <span className="sr-only">View details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-base-200/35">
                        <td className="max-w-80 truncate font-medium">
                          {run.promptValue ?? "Tracked prompt"}
                        </td>
                        <td>
                          <ProviderBadge
                            provider={run.provider}
                            model={run.model}
                          />
                        </td>
                        <td>
                          <StatusBadge status={run.status} />
                        </td>
                        <td>
                          {mentionOutcomeLabel(
                            run.status,
                            run.brandMentioned,
                          ) === "Mentioned" ? (
                            <span className="text-success">Mentioned</span>
                          ) : mentionOutcomeLabel(
                              run.status,
                              run.brandMentioned,
                            ) === "Not mentioned" ? (
                            <span className="text-base-content/45">
                              Not mentioned
                            </span>
                          ) : (
                            <span className="text-base-content/45">
                              Unknown
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap font-mono text-xs text-base-content/55">
                          {run.latencyMs !== null
                            ? `${(run.latencyMs / 1000).toFixed(1)}s`
                            : "—"}
                        </td>
                        {showProviderCosts ? (
                          <td className="whitespace-nowrap font-mono text-xs text-base-content/60">
                            {formatUsd(run.costUsd)}
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap text-base-content/50">
                          {formatRelative(run.createdAt)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-square btn-sm"
                            aria-label={`View run details for ${run.promptValue ?? "tracked prompt"}`}
                            onClick={() => setSelectedRunId(run.id)}
                          >
                            <ChevronRight className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No runs yet"
                description="Run one of your prompts to collect the first answer."
              />
            )}
          </section>
        </>
      ) : null}
      <CrawlerTrafficSummary projectId={project.id} />
      <RunDetailDrawer
        run={selectedRun}
        pending={detailQuery.isPending && Boolean(selectedRunId)}
        error={
          detailQuery.isError ? (detailQuery.error as Error).message : null
        }
        open={Boolean(selectedRunId)}
        onClose={() => setSelectedRunId(null)}
      />
    </div>
  );
}

function RunDetailDrawer({
  run,
  pending,
  error,
  open,
  onClose,
}: {
  run: RunDetail | null;
  pending: boolean;
  error: string | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25">
      <button
        type="button"
        className="flex-1"
        aria-label="Close run details"
        onClick={onClose}
      />
      <aside
        className="h-full w-full max-w-xl overflow-auto border-l border-base-300 bg-base-100 shadow-2xl"
        aria-label="Run details"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-base-300 bg-base-100 px-5 py-4">
          <div>
            <h2 className="font-semibold">Run details</h2>
            <p className="mt-0.5 max-w-md truncate text-xs text-base-content/45">
              {run?.promptValue ?? "Loading stored answer and evidence…"}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-square btn-sm"
            aria-label="Close run details"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">
          {pending ? <LoadingBlock className="h-72" /> : null}
          {error ? <ErrorState message={error} /> : null}
          {run ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 rounded-lg border border-base-300 bg-base-200/35 p-4 text-sm">
                <div>
                  <p className="subtle-label">Provider</p>
                  <div className="mt-1">
                    <ProviderBadge provider={run.provider} model={run.model} />
                  </div>
                </div>
                <div>
                  <p className="subtle-label">Status</p>
                  <div className="mt-1">
                    <StatusBadge status={run.status} />
                  </div>
                </div>
                <div>
                  <p className="subtle-label">Mentioned</p>
                  <p className="mt-1 font-medium">
                    {mentionOutcomeLabel(run.status, run.brandMentioned)}
                  </p>
                </div>
                <div>
                  <p className="subtle-label">Citations</p>
                  <p className="mt-1 font-mono">{run.citations.length}</p>
                </div>
              </div>
              {run.error ? <ErrorState message={run.error} /> : null}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Answer</h3>
                <div className="markdown-answer rounded-lg border border-base-300 bg-base-200/35 p-4 text-sm">
                  {run.answer ? (
                    <MarkdownAnswer>{run.answer}</MarkdownAnswer>
                  ) : (
                    "No answer stored."
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

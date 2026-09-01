import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  Bot,
  CircleAlert,
  Info,
  MousePointerClick,
  Quote,
  Target,
  Timer,
} from "lucide-react";
import { api, tenantQueryKey } from "../api";
import type {
  AiReferralMetrics,
  AiReferralsResponse,
  AiReferralSource,
  Project,
} from "../types";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  formatRelative,
} from "../components/ui";

function count(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
        value,
      );
}

function percentage(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat(undefined, {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
}

function duration(value: number | null): string {
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds}s`;
}

function comparison(
  current: number | null,
  previous: number | null,
  period: string,
): string {
  const periodLabel = period.endsWith("d")
    ? `${period.slice(0, -1)} days`
    : period;
  if (current === null || previous === null) {
    return `vs previous ${periodLabel}`;
  }
  if (previous === 0) {
    return `${current === 0 ? "No change" : "New activity"} vs previous ${periodLabel}`;
  }
  const change = (current - previous) / previous;
  return `${change >= 0 ? "+" : ""}${percentage(change)} vs previous ${periodLabel}`;
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <div className="metric-card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-base-content/50">{label}</p>
        <Icon className="size-4 text-base-content/35" />
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-base-content/40">{detail}</p>
    </div>
  );
}

function SourceLandingPages({ source }: { source: AiReferralSource }) {
  return (
    <div className="min-w-80 space-y-2">
      {source.landingPages.slice(0, 4).map((page) => (
        <div key={page.path} className="text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="max-w-64 truncate font-mono" title={page.path}>
              {page.path}
            </span>
            {page.trackedCitationCount > 0 ? (
              <span className="badge badge-info badge-sm whitespace-nowrap">
                Tracked citation
                {page.trackedCitationCount > 1
                  ? ` ×${page.trackedCitationCount}`
                  : ""}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-base-content/40">
            {page.sessions} {page.sessions === 1 ? "session" : "sessions"} ·{" "}
            {page.pageviews} pageviews
            {page.conversions === null ? "" : ` · ${page.conversions} outcomes`}
          </p>
        </div>
      ))}
      {source.landingPages.length > 4 ? (
        <p className="text-xs text-base-content/35">
          +{source.landingPages.length - 4} more paths
        </p>
      ) : null}
    </div>
  );
}

function sourceMetric(
  source: AiReferralSource,
  key: keyof AiReferralMetrics,
): number | null {
  return source[key];
}

export function AiReferralsPage({ project }: { project: Project }) {
  const [period, setPeriod] = useState("30d");
  const query = useQuery({
    queryKey: tenantQueryKey("ai-referrals", project.id, period),
    queryFn: () =>
      api<AiReferralsResponse>(
        `/projects/${project.id}/ai-referrals?period=${period}`,
      ),
  });
  const data = query.data?.configured ? query.data.data : null;
  const totals = data?.totals;
  const previous = data?.previousPeriod;
  const pageviewsPerSession = totals?.sessions
    ? totals.pageviews / totals.sessions
    : null;

  return (
    <div className="page-shell">
      <PageHeader
        title="AI outcomes"
        description={`Observed engagement and configured outcomes from known AI-assistant referrals to ${project.name}.`}
        actions={
          <select
            className="select select-sm border-base-300 bg-base-100"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
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
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <LoadingBlock key={index} className="h-28" />
            ))}
          </div>
          <LoadingBlock className="mt-4 h-72" />
        </>
      ) : query.data && !query.data.configured ? (
        <section className="data-panel">
          <EmptyState
            title="Connect PostHog to measure AI outcomes"
            description={
              query.data.missing.includes("PostHog integration")
                ? "Connect a PostHog project with read-only query access. Credentials stay encrypted and are never returned to the browser."
                : `Set ${query.data.missing.join(", ")} on the server. The personal API key needs Query Read access and is never returned to the browser.`
            }
            action={
              query.data.missing.includes("PostHog integration") ? (
                <Link className="btn btn-primary btn-sm" to="../settings">
                  Connect PostHog
                </Link>
              ) : (
                <a
                  className="btn btn-sm"
                  href="https://posthog.com/docs/api/queries"
                  target="_blank"
                  rel="noreferrer"
                >
                  PostHog query setup
                </a>
              )
            }
          />
        </section>
      ) : data && totals && previous ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Observed sessions"
              value={count(totals.sessions)}
              detail={comparison(totals.sessions, previous.sessions, period)}
              icon={MousePointerClick}
            />
            <MetricCard
              label="Converting sessions"
              value={count(totals.convertingSessions)}
              detail={
                totals.conversionRate === null
                  ? "Configure success events to measure"
                  : `${percentage(totals.conversionRate)} conversion rate`
              }
              icon={Target}
            />
            <MetricCard
              label="Cited-page sessions"
              value={count(data.citedLandingPageSessions)}
              detail={`${data.trackedCitationCount} tracked citation${data.trackedCitationCount === 1 ? "" : "s"} matched`}
              icon={Quote}
            />
            <MetricCard
              label="Pageviews / session"
              value={count(pageviewsPerSession)}
              detail={`${totals.pageviews} pageviews from AI referrals`}
              icon={Activity}
            />
            <MetricCard
              label="Average duration"
              value={duration(totals.averageSessionDurationSeconds)}
              detail={comparison(
                totals.averageSessionDurationSeconds,
                previous.averageSessionDurationSeconds,
                period,
              )}
              icon={Timer}
            />
            <MetricCard
              label="Bounce rate"
              value={percentage(totals.bounceRate)}
              detail={comparison(
                totals.bounceRate,
                previous.bounceRate,
                period,
              )}
              icon={Bot}
            />
          </div>

          <div className="alert mt-4 border border-info/25 bg-info/10 text-sm text-base-content">
            <Info className="size-4 text-info" />
            <span>
              Referrers prove that a browser followed a link from an assistant
              domain. Citation badges only show that aeokit also observed that
              landing URL in a tracked answer during this period; they do not
              prove which answer caused a visit. Referrer-stripped clicks can
              appear as Direct, so session counts remain a floor.
            </span>
          </div>

          {data.successEvents.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-base-content/50">
              <span className="font-medium">Success events:</span>
              {data.successEvents.map((event) => (
                <span
                  key={event}
                  className="badge badge-ghost badge-sm font-mono"
                >
                  {event}
                </span>
              ))}
            </div>
          ) : null}

          <section className="data-panel mt-4">
            <div className="flex items-start justify-between gap-3 border-b border-base-300 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold leading-tight">
                  Outcomes by source
                </h2>
                <p className="mt-0.5 text-xs text-base-content/45">
                  Entry referrer, engagement, and landing paths for{" "}
                  {data.siteHost}
                </p>
              </div>
              <p className="shrink-0 text-xs text-base-content/35">
                Updated {formatRelative(data.queriedAt)}
                {data.cached ? " · cached" : ""}
              </p>
            </div>
            {data.sources.length ? (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Sessions</th>
                      <th>Outcomes</th>
                      <th>Conversion rate</th>
                      <th>Avg duration</th>
                      <th>Bounce rate</th>
                      <th className="w-full">Landing pages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.map((source) => (
                      <tr key={source.domain} className="hover:bg-base-200/35">
                        <td>
                          <div>
                            <p className="font-medium">{source.label}</p>
                            <p className="font-mono text-xs text-base-content/40">
                              {source.domain}
                            </p>
                          </div>
                        </td>
                        <td className="font-mono font-semibold">
                          {source.sessions}
                        </td>
                        <td className="font-mono">
                          {source.conversions ?? "—"}
                        </td>
                        <td className="font-mono">
                          {percentage(sourceMetric(source, "conversionRate"))}
                        </td>
                        <td className="font-mono">
                          {duration(
                            sourceMetric(
                              source,
                              "averageSessionDurationSeconds",
                            ),
                          )}
                        </td>
                        <td className="font-mono">
                          {percentage(sourceMetric(source, "bounceRate"))}
                        </td>
                        <td>
                          <SourceLandingPages source={source} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No visible AI referrals"
                description="No sessions with a known AI-assistant entry referrer were observed in this period. App-originated clicks may still be counted as Direct."
              />
            )}
          </section>

          {!data.successEvents.length ? (
            <div className="mt-4 flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <p>
                Conversion metrics are intentionally blank. Add exact PostHog
                event names under{" "}
                <Link to="../settings">Settings → Integrations</Link>, or set{" "}
                <code className="rounded bg-base-300/60 px-1 py-0.5 font-mono text-xs">
                  POSTHOG_SUCCESS_EVENTS
                </code>{" "}
                for a self-hosted deployment.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

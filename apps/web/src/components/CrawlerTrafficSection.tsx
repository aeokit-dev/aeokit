import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Bot, CloudOff, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { api, ApiError, tenantQueryKey } from "../api";
import type { CrawlerTrafficData, CrawlerTrafficHistoryData } from "../types";
import { EmptyState, LoadingBlock, formatDate } from "./ui";

const numberFormatter = new Intl.NumberFormat();

function CrawlerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-base-200/60 p-3">
      <div className="text-xs font-medium text-base-content/50">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

export function UnavailableState({
  code,
  settingsTo = "../settings",
}: {
  code?: string | undefined;
  settingsTo?: string;
}) {
  const state = crawlerUnavailableState(code);
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-6 py-8 text-center">
      <div className="mb-3 rounded-full bg-base-200 p-3 text-base-content/40">
        <CloudOff className="size-5" />
      </div>
      <h3 className="text-sm font-semibold">{state.title}</h3>
      <p className="mt-1 max-w-lg text-sm text-base-content/50">
        {state.description}
      </p>
      {code === "cloudflare_not_configured" ? (
        <Link className="btn btn-primary btn-sm mt-4" to={settingsTo}>
          Connect Cloudflare
        </Link>
      ) : null}
    </div>
  );
}

function crawlerUnavailableState(code?: string) {
  switch (code) {
    case "cloudflare_not_configured":
      return {
        title: "Cloudflare analytics is not connected",
        description:
          "Connect Cloudflare in Settings to view crawler analytics for this project.",
      };
    case "cloudflare_insufficient_permissions":
      return {
        title: "Crawler analytics unavailable",
        description:
          "The Cloudflare token does not have permission to read this site's analytics.",
      };
    case "cloudflare_zone_not_found":
      return {
        title: "Crawler analytics unavailable",
        description:
          "No accessible Cloudflare zone was found for this project's website.",
      };
    default:
      return {
        title: "Crawler analytics unavailable",
        description:
          "Cloudflare crawler analytics is temporarily unavailable. Please try again later.",
      };
  }
}

export function CrawlerTrafficSummary({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: tenantQueryKey("crawler-traffic", projectId),
    queryFn: () =>
      api<CrawlerTrafficData>(`/projects/${projectId}/crawler-traffic`),
    retry: false,
    staleTime: 5 * 60 * 1_000,
    refetchInterval: 5 * 60 * 1_000,
  });

  return (
    <section className="data-panel mt-4">
      <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Bot className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold leading-tight">
              Crawler traffic
            </h2>
            <p className="mt-0.5 text-xs text-base-content/45">
              Identified from declared user agents · last 24 hours
            </p>
          </div>
        </div>
        <Link
          to="crawler-traffic"
          className="btn btn-ghost btn-sm shrink-0 text-xs"
        >
          View details <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      {query.isPending ? (
        <div className="p-4">
          <LoadingBlock className="h-20" />
        </div>
      ) : query.isError ? (
        <UnavailableState
          code={query.error instanceof ApiError ? query.error.code : undefined}
          settingsTo="settings"
        />
      ) : query.data.totalRequests === 0 ? (
        <p className="px-4 py-5 text-sm text-base-content/50">
          Cloudflare reported no requests in the last 24 hours.
        </p>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <CrawlerMetric
            label="Total requests"
            value={numberFormatter.format(query.data.totalRequests)}
          />
          <CrawlerMetric
            label="Identified crawlers"
            value={numberFormatter.format(query.data.identifiedCrawlerRequests)}
          />
          <CrawlerMetric
            label="Crawler share"
            value={`${query.data.crawlerSharePercentage}%`}
          />
        </div>
      )}
    </section>
  );
}

function CrawlerTrafficHistory({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: tenantQueryKey("crawler-traffic-history", projectId),
    queryFn: () =>
      api<CrawlerTrafficHistoryData>(
        `/projects/${projectId}/crawler-traffic/history`,
      ),
    retry: false,
    staleTime: 5 * 60 * 1_000,
    refetchInterval: 5 * 60 * 1_000,
  });

  return (
    <div className="border-t border-base-300">
      <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Daily crawler history</h3>
          <p className="mt-0.5 text-xs text-base-content/45">
            Permanent aggregate snapshots for completed UTC days
          </p>
        </div>
        <span className="text-[11px] text-base-content/45">
          Backfills up to 7 available days
        </span>
      </div>
      {query.isPending ? (
        <div className="px-4 pb-4">
          <LoadingBlock className="h-24" />
        </div>
      ) : query.isError ? (
        <p className="px-4 pb-4 text-sm text-base-content/50">
          Stored crawler history could not be loaded. Live analytics above are
          unaffected.
        </p>
      ) : query.data.days.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-base-content/50">
          Daily snapshots will appear after the scheduled history importer
          completes its first run.
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>UTC day</th>
                <th>Total requests</th>
                <th>Identified crawlers</th>
                <th>Crawler share</th>
                <th>Leading families</th>
              </tr>
            </thead>
            <tbody>
              {query.data.days.slice(0, 14).map((day) => (
                <tr key={day.date}>
                  <td className="whitespace-nowrap font-medium">
                    {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric", timeZone: "UTC" },
                    )}
                  </td>
                  <td className="font-mono text-xs">
                    {numberFormatter.format(day.totalRequests)}
                  </td>
                  <td className="font-mono text-xs">
                    {numberFormatter.format(day.identifiedCrawlerRequests)}
                  </td>
                  <td className="font-mono text-xs">
                    {day.crawlerSharePercentage}%
                  </td>
                  <td>
                    <div className="flex min-w-52 flex-wrap gap-1">
                      {day.families.slice(0, 3).map((family) => (
                        <span
                          key={family.family}
                          className="badge badge-ghost badge-sm whitespace-nowrap text-[11px]"
                        >
                          {family.family} ·{" "}
                          {numberFormatter.format(family.requests)}
                        </span>
                      ))}
                      {day.families.length === 0 ? (
                        <span className="text-xs text-base-content/40">
                          None identified
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CrawlerTrafficSection({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: tenantQueryKey("crawler-traffic", projectId),
    queryFn: () =>
      api<CrawlerTrafficData>(`/projects/${projectId}/crawler-traffic`),
    retry: false,
    staleTime: 5 * 60 * 1_000,
    refetchInterval: 5 * 60 * 1_000,
  });

  return (
    <section className="data-panel">
      <div className="flex flex-col gap-3 border-b border-base-300 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary">
            <Bot className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold leading-tight">
              Live traffic
            </h2>
            <p className="mt-0.5 text-xs text-base-content/45">
              Requests to the site's apex and www hostnames
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-base-content/55">
          <span className="rounded-full bg-base-200 px-2.5 py-1">
            Last 24 hours
          </span>
          <span className="rounded-full bg-base-200 px-2.5 py-1">
            Based on declared user agents
          </span>
        </div>
      </div>

      {query.isPending ? (
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <LoadingBlock className="h-20" />
          <LoadingBlock className="h-20" />
          <LoadingBlock className="h-20" />
        </div>
      ) : query.isError ? (
        <UnavailableState
          code={query.error instanceof ApiError ? query.error.code : undefined}
        />
      ) : query.data.totalRequests === 0 ? (
        <EmptyState
          title="No traffic in the last 24 hours"
          description="Cloudflare reported no requests for the site's apex or www hostname during this window."
        />
      ) : (
        <div className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <CrawlerMetric
              label="Total requests"
              value={numberFormatter.format(query.data.totalRequests)}
            />
            <CrawlerMetric
              label="Identified crawler requests"
              value={numberFormatter.format(
                query.data.identifiedCrawlerRequests,
              )}
            />
            <CrawlerMetric
              label="Crawler share"
              value={`${query.data.crawlerSharePercentage}%`}
            />
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/45">
                Crawler families
              </h3>
              {query.data.families.length ? (
                <div className="mt-3 space-y-3">
                  {query.data.families.map((item) => {
                    const share =
                      query.data.identifiedCrawlerRequests > 0
                        ? (item.requests /
                            query.data.identifiedCrawlerRequests) *
                          100
                        : 0;
                    return (
                      <div key={item.family}>
                        <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
                          <span className="font-medium">{item.family}</span>
                          <span className="font-mono text-xs text-base-content/50">
                            {numberFormatter.format(item.requests)} ·{" "}
                            {Math.round(share)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-base-200">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-base-content/50">
                  No declared crawler user agents were identified in this
                  window.
                </p>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/45">
                Top declared user agents
              </h3>
              {query.data.topUserAgents.length ? (
                <div className="mt-3 divide-y divide-base-300 rounded-lg border border-base-300">
                  {query.data.topUserAgents.slice(0, 6).map((item) => (
                    <div
                      key={item.userAgent}
                      className="flex items-start justify-between gap-4 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="break-words font-mono text-xs">
                          {item.userAgent}
                        </div>
                        <div className="mt-0.5 text-[11px] text-base-content/45">
                          {item.family}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-xs text-base-content/55">
                        {numberFormatter.format(item.requests)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-base-content/50">
                  No declared crawler user agents were identified in this
                  window.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-lg bg-base-200/60 px-3 py-2.5 text-xs text-base-content/55">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <p>
              This is identified crawler traffic, not all bot traffic. It is
              based on declared user agents and may exclude disguised bots.
              Window ended {formatDate(query.data.end)}.
            </p>
          </div>
        </div>
      )}
      <CrawlerTrafficHistory projectId={projectId} />
    </section>
  );
}

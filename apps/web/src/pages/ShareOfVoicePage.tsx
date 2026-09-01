import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Gauge,
  Inbox,
  Link2,
  MousePointerClick,
  Quote,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
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
import type {
  AiReferralsResponse,
  CrawlerTrafficHistoryData,
  Opportunity,
  Project,
  ShareOfVoiceReport,
} from "../types";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  unknownValue,
} from "../components/ui";
import { readQueryParam, updateQueryParam } from "../url-search-params";

type Period = "7d" | "30d" | "90d";

const periods = ["7d", "30d", "90d"] as const satisfies readonly Period[];

const numberFormatter = new Intl.NumberFormat();

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-base-content/55">{label}</p>
        <span className="rounded-md bg-base-200 p-1.5 text-base-content/40">
          {icon}
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-base-content/45">{detail}</div>
    </div>
  );
}

function PanelHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-base-300 px-4 py-3">
      <div>
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        <p className="mt-0.5 text-xs text-base-content/45">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Change({ value }: { value: number | null }) {
  // A period with nothing measured gives no movement to report. Showing a
  // computed delta against it reads as real change.
  if (value === null) {
    return (
      <span className="text-base-content/45">No prior period to compare</span>
    );
  }
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : ArrowRight;
  const className =
    value > 0
      ? "text-success"
      : value < 0
        ? "text-error"
        : "text-base-content/45";
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Icon className="size-3.5" />
      {value > 0 ? "+" : ""}
      {value} pts
    </span>
  );
}

function ConfidenceBadge({
  level,
}: {
  level: ShareOfVoiceReport["confidence"]["level"];
}) {
  const classes = {
    none: "badge-ghost",
    high: "badge-success",
    medium: "badge-warning",
    low: "badge-error",
  } as const;
  return (
    <span className={`badge badge-sm capitalize ${classes[level]}`}>
      {level} confidence
    </span>
  );
}

function ShareTrend({
  report,
  project,
}: {
  report: ShareOfVoiceReport;
  project: Project;
}) {
  return (
    <section className="data-panel">
      <PanelHeading
        title="Visibility trend"
        description={`${project.name}'s daily share of tracked brand mentions`}
        action={<Activity className="size-4 text-base-content/35" />}
      />
      {report.trend.length ? (
        <div className="h-72 p-4 pl-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={report.trend}
              margin={{ left: -15, right: 12, top: 8, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="shareOfVoiceFill"
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
                tick={{ fontSize: 11, fill: "currentColor", opacity: 0.45 }}
                tickFormatter={(value: string) =>
                  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "currentColor", opacity: 0.45 }}
                tickFormatter={(value: number) => `${value}%`}
              />
              <Tooltip
                formatter={(value) => [`${value}%`, "Share of voice"]}
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
                dataKey="share"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#shareOfVoiceFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState
          title="No trend yet"
          description="Successful prompt runs will build a daily share-of-voice trend."
        />
      )}
    </section>
  );
}

function Leaderboard({
  report,
  project,
}: {
  report: ShareOfVoiceReport;
  project: Project;
}) {
  return (
    <section className="data-panel">
      <PanelHeading
        title="Leaderboard"
        description={`${report.overview.totalMentions} mentions across tracked brands`}
        action={<Trophy className="size-4 text-warning" />}
      />
      <div className="space-y-4 p-4">
        {report.overview.leaderboard.map((row, index) => (
          <div key={row.name}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">
                <span className="mr-2 font-mono text-xs text-base-content/35">
                  {index + 1}
                </span>
                {row.name}
                {row.name === project.name ? (
                  <span className="badge badge-primary badge-sm ml-2">You</span>
                ) : null}
              </span>
              <span className="shrink-0 font-mono text-xs">
                {row.share}% · {row.mentions}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-base-200">
              <div
                className={`h-full rounded-full ${row.name === project.name ? "bg-primary" : "bg-base-content/25"}`}
                style={{
                  width: `${Math.max(row.share, row.mentions ? 2 : 0)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EngineBreakdown({ report }: { report: ShareOfVoiceReport }) {
  return (
    <section className="data-panel mt-4">
      <PanelHeading
        title="Engine breakdown"
        description="Share of voice and run reliability for each configured surface"
        action={<Bot className="size-4 text-base-content/35" />}
      />
      {report.engines.length === 0 ? (
        <EmptyState
          title="No configured surfaces"
          description="Add provider targets to your prompts to compare share of voice by answer surface."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3">
          {report.engines.map((engine) => {
            const completed = engine.successfulRuns + engine.failedRuns;
            const reliable = completed
              ? Math.round((engine.successfulRuns / completed) * 100)
              : 0;
            return (
              <article
                key={`${engine.provider}:${engine.model}`}
                className="p-4 outline outline-base-300 -outline-offset-[0.5px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">
                      {engine.engine}
                    </h3>
                    <p className="truncate text-xs text-base-content/45">
                      {engine.providerLabel}
                    </p>
                  </div>
                  {engine.failedRuns ? (
                    <span className="badge badge-error badge-sm shrink-0">
                      {engine.failedRuns} failed
                    </span>
                  ) : completed ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                  ) : (
                    <span className="badge badge-ghost badge-sm shrink-0">
                      No runs
                    </span>
                  )}
                </div>
                <p className="mt-3 text-2xl font-semibold">{engine.share}%</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-base-200">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${engine.share}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-base-content/45">
                  {engine.mentions}/{engine.totalMentions} mentions · {reliable}
                  % run success
                </p>
                {engine.configured ? null : (
                  <p className="mt-2 text-xs text-warning">
                    No longer a configured surface
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PromptBreakdown({ report }: { report: ShareOfVoiceReport }) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.7fr)]">
      <section className="data-panel">
        <PanelHeading
          title="Category share"
          description="Primary prompt tag, aggregated across successful runs"
        />
        {report.categories.length ? (
          <div className="space-y-4 p-4">
            {report.categories.map((category) => (
              <div key={category.category}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {category.category}
                    </p>
                    <p className="text-[11px] text-base-content/40">
                      {category.prompts} prompt
                      {category.prompts === 1 ? "" : "s"} ·{" "}
                      {category.successfulRuns} runs
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold">
                    {category.share}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-base-200">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${category.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No prompt categories"
            description="Add tags to prompts to compare share of voice by category."
          />
        )}
      </section>

      <section className="data-panel">
        <PanelHeading
          title="Prompt-level share"
          description="See exactly where your brand leads or loses"
          action={
            <Link className="btn btn-ghost btn-sm text-xs" to="../prompts">
              Manage prompts <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        {report.prompts.length ? (
          <div className="overflow-x-auto">
            <table className="table table-sm min-w-[46rem]">
              <thead>
                <tr>
                  <th className="w-full">Prompt</th>
                  <th>Category</th>
                  <th>Runs</th>
                  <th>Leader</th>
                  <th>Your share</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {report.prompts.map((row) => (
                  <tr key={row.promptId} className="hover:bg-base-200/35">
                    <td>
                      <Link
                        className="block max-w-lg truncate font-medium hover:text-primary"
                        title={row.prompt}
                        to={`../runs?promptId=${encodeURIComponent(row.promptId)}`}
                      >
                        {row.prompt}
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-ghost badge-sm whitespace-nowrap">
                        {row.category}
                      </span>
                    </td>
                    <td className="font-mono text-xs">{row.successfulRuns}</td>
                    <td className="whitespace-nowrap text-sm font-medium">
                      {row.leader}
                    </td>
                    <td className="font-mono text-sm font-semibold">
                      {row.share}%
                    </td>
                    <td>
                      <span
                        className={`font-mono text-xs ${row.gap > 0 ? "text-error" : "text-success"}`}
                      >
                        {row.gap > 0 ? `-${row.gap} pts` : "Leading"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No tracked prompts"
            description="Add prompts to measure category and prompt-level share of voice."
          />
        )}
      </section>
    </div>
  );
}

function CitationOwnership({ report }: { report: ShareOfVoiceReport }) {
  const ownership = report.citationOwnership;
  return (
    <section className="data-panel mt-4">
      <PanelHeading
        title="Citation ownership"
        description="Which pages answer engines use as evidence"
        action={
          <Link className="btn btn-ghost btn-sm text-xs" to="../citations">
            All citations <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      {ownership.total ? (
        <div className="grid gap-6 p-4 lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="subtle-label">Owned share</p>
                <p className="mt-1 text-3xl font-semibold">
                  {ownership.ownedShare}%
                </p>
              </div>
              <p className="text-xs text-base-content/45">
                {ownership.owned}/{ownership.total} citations
              </p>
            </div>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-base-200">
              <div
                className="bg-success"
                style={{ width: `${ownership.ownedShare}%` }}
                title={`${ownership.owned} owned`}
              />
              <div
                className="bg-warning"
                style={{
                  width: `${(ownership.competitor / ownership.total) * 100}%`,
                }}
                title={`${ownership.competitor} competitor`}
              />
              <div
                className="bg-info"
                style={{
                  width: `${(ownership.thirdParty / ownership.total) * 100}%`,
                }}
                title={`${ownership.thirdParty} third-party`}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-success/10 p-2">
                <p className="font-semibold text-success">{ownership.owned}</p>
                <p className="mt-0.5 text-base-content/45">Owned</p>
              </div>
              <div className="rounded-lg bg-warning/15 p-2">
                <p className="font-semibold">{ownership.competitor}</p>
                <p className="mt-0.5 text-base-content/45">Competitor</p>
              </div>
              <div className="rounded-lg bg-info/10 p-2">
                <p className="font-semibold text-info">
                  {ownership.thirdParty}
                </p>
                <p className="mt-0.5 text-base-content/45">Third party</p>
              </div>
            </div>
          </div>

          <div>
            <p className="subtle-label">Owned pages earning citations</p>
            <div className="mt-2 divide-y divide-base-300 rounded-lg border border-base-300">
              {ownership.ownedPages.slice(0, 5).map((page) => (
                <a
                  key={page.url}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-base-200/40"
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {page.title || page.domain}
                    </span>
                    <span className="block truncate text-xs text-base-content/40">
                      {page.url}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-base-content/50">
                    {page.citations}
                  </span>
                  <ExternalLink className="size-3.5 text-base-content/30" />
                </a>
              ))}
              {!ownership.ownedPages.length ? (
                <p className="px-3 py-5 text-sm text-base-content/45">
                  No owned page earned a citation in this period.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <p className="subtle-label">External sources winning evidence</p>
            <div className="mt-2 divide-y divide-base-300 rounded-lg border border-base-300">
              {ownership.externalSources.slice(0, 5).map((source) => (
                <div
                  key={`${source.domain}:${source.category}:${source.competitorName ?? ""}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {source.competitorName || source.domain}
                    </p>
                    <p className="text-xs capitalize text-base-content/40">
                      {source.domain} · {source.category}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-base-content/50">
                    {source.citations}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No citation evidence yet"
          description="Grounded answers will show owned pages, competitor pages, and third-party sources here."
        />
      )}
    </section>
  );
}

function CompetitorGaps({ report }: { report: ShareOfVoiceReport }) {
  return (
    <section className="data-panel mt-4">
      <PanelHeading
        title="Why competitors win"
        description="Runs where a competitor appeared and your brand did not, tied to category, engine, and citations"
        action={<CircleAlert className="size-4 text-warning" />}
      />
      {report.competitorGaps.length ? (
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {report.competitorGaps.map((gap) => (
            <article
              key={`${gap.competitor}:${gap.category}:${gap.engine}:${gap.engineProvider}`}
              className="rounded-xl border border-base-300 bg-base-200/30 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{gap.competitor}</h3>
                  <p className="mt-0.5 text-xs text-base-content/45">
                    {gap.category} · {gap.engine} · {gap.engineProvider}
                  </p>
                </div>
                <span className="badge badge-warning badge-sm">
                  {gap.losses} loss{gap.losses === 1 ? "" : "es"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-base-content/65">
                {gap.reason}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="badge badge-ghost badge-sm">
                  {gap.competitorCitations} competitor citations
                </span>
                <span className="badge badge-ghost badge-sm">
                  {gap.thirdPartyCitations} third-party citations
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No explained competitor gaps"
          description="No successful run in this period mentioned a competitor while omitting your brand."
        />
      )}
    </section>
  );
}

function OpportunityInbox({
  opportunities,
  pending,
  error,
}: {
  opportunities: Opportunity[];
  pending: boolean;
  error: Error | null;
}) {
  const priority = (value: number) =>
    value >= 85
      ? { label: "High", className: "badge-error" }
      : value >= 70
        ? { label: "Medium", className: "badge-warning" }
        : { label: "Monitor", className: "badge-ghost" };
  return (
    <section className="data-panel mt-4">
      <PanelHeading
        title="Opportunity Inbox"
        description="Persistent, prioritized actions from the evidence pipeline"
        action={
          <Link className="btn btn-ghost btn-sm text-xs" to="../opportunities">
            View inbox <Inbox className="size-3.5" />
          </Link>
        }
      />
      {pending ? (
        <div className="p-4">
          <LoadingBlock className="h-36" />
        </div>
      ) : error ? (
        <div className="p-4">
          <ErrorState message={error.message} />
        </div>
      ) : opportunities.length ? (
        <div className="divide-y divide-base-300">
          {opportunities.slice(0, 5).map((opportunity, index) => {
            const priorityDetails = priority(opportunity.priority);
            return (
              <article
                key={opportunity.id}
                className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-base-200 font-mono text-xs font-semibold text-base-content/45">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        {opportunity.title}
                      </h3>
                      <span
                        className={`badge badge-sm ${priorityDetails.className}`}
                      >
                        {priorityDetails.label} · {opportunity.priority}
                      </span>
                      {opportunity.earlySignal ? (
                        <span className="badge badge-warning badge-sm">
                          Early signal
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-base-content/55">
                      {opportunity.explanation}
                    </p>
                    <p className="mt-1.5 text-sm font-medium">
                      {opportunity.recommendedAction}
                    </p>
                  </div>
                </div>
                <Link
                  className="btn btn-ghost btn-sm ml-10 shrink-0 text-xs lg:ml-0"
                  to="../opportunities"
                >
                  {opportunity.evidenceIds.length} evidence
                  <ArrowRight className="size-3.5" />
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No prioritized actions yet"
          description="New evidence-backed actions appear after tracked prompts finish or provider reliability changes."
        />
      )}
    </section>
  );
}

export function MeasurementLoop({
  report,
  referrals,
  referralsPending,
  crawlerHistory,
  crawlerPending,
}: {
  report: ShareOfVoiceReport;
  referrals: AiReferralsResponse | undefined;
  referralsPending: boolean;
  crawlerHistory: CrawlerTrafficHistoryData | undefined;
  crawlerPending: boolean;
}) {
  const currentStart = report.period.currentStart.slice(0, 10);
  const currentEnd = report.period.currentEnd.slice(0, 10);
  const crawlerDays = (crawlerHistory?.days ?? []).filter(
    (day) => day.date >= currentStart && day.date <= currentEnd,
  );
  const crawlerRequests = crawlerDays.reduce(
    (sum, day) => sum + day.identifiedCrawlerRequests,
    0,
  );
  const referralData = referrals?.configured ? referrals.data : null;
  const postHogMissing = referrals && !referrals.configured;
  const stages = [
    {
      label: "Identified crawls",
      value: crawlerPending
        ? "…"
        : crawlerHistory
          ? numberFormatter.format(crawlerRequests)
          : "—",
      detail: crawlerHistory
        ? `${crawlerDays.length} stored days`
        : "Connect Cloudflare",
      icon: <Bot className="size-4" />,
      to: "../crawler-traffic",
    },
    {
      label: "AI mentions",
      value: numberFormatter.format(report.overview.mentions),
      detail: `${report.overview.share}% share of voice`,
      icon: <Sparkles className="size-4" />,
      to: "../runs",
    },
    {
      label: "Owned citations",
      value: numberFormatter.format(report.citationOwnership.owned),
      detail: `${report.citationOwnership.ownedShare}% citation ownership`,
      icon: <Link2 className="size-4" />,
      to: "../citations",
    },
    {
      label: "AI referrals",
      value: referralsPending
        ? "…"
        : referralData
          ? numberFormatter.format(referralData.totals.sessions)
          : "—",
      detail: referralData
        ? "Observed web sessions"
        : postHogMissing
          ? "Connect PostHog"
          : "Analytics unavailable",
      icon: <MousePointerClick className="size-4" />,
      to: "../ai-referrals",
    },
    {
      label: "Cited-page sessions",
      value: referralsPending
        ? "…"
        : !referralData
          ? "—"
          : numberFormatter.format(referralData.citedLandingPageSessions),
      detail: referralData
        ? `${referralData.trackedCitationCount} tracked citations matched`
        : "Analytics unavailable",
      icon: <Quote className="size-4" />,
      to: "../ai-referrals",
    },
    {
      label: "AI outcomes",
      value: referralsPending
        ? "…"
        : referralData?.totals.conversions === null || !referralData
          ? "—"
          : numberFormatter.format(referralData.totals.conversions),
      detail: !referralData
        ? postHogMissing
          ? "Connect PostHog"
          : "Analytics unavailable"
        : referralData.totals.convertingSessions === null
          ? "Configure PostHog success events"
          : `${referralData.totals.convertingSessions} converting sessions · ${referralData.successEvents.join(", ")}`,
      icon: <Target className="size-4" />,
      to: "../settings",
    },
  ];

  return (
    <section className="data-panel mt-4">
      <PanelHeading
        title="Measurement loop"
        description="One view from crawler discovery through AI visibility and on-site outcomes"
        action={<ShieldCheck className="size-4 text-success" />}
      />
      <div className="grid gap-px bg-base-300 sm:grid-cols-2 xl:grid-cols-6">
        {stages.map((stage, index) => (
          <Link
            key={stage.label}
            className="group relative bg-base-100 p-4 transition-colors hover:bg-base-200/60"
            to={stage.to}
          >
            <div className="flex items-center justify-between text-base-content/40">
              <span className="rounded-md bg-base-200 p-1.5 group-hover:text-primary">
                {stage.icon}
              </span>
              {index < stages.length - 1 ? (
                <ArrowRight className="size-3.5 opacity-40" />
              ) : null}
            </div>
            <p className="mt-3 text-2xl font-semibold">{stage.value}</p>
            <p className="mt-1 text-sm font-medium">{stage.label}</p>
            <p className="mt-1 truncate text-xs text-base-content/40">
              {stage.detail}
            </p>
          </Link>
        ))}
      </div>
      <div className="border-t border-base-300 bg-base-200/35 px-4 py-3 text-xs text-base-content/50">
        These stages are observational, not an attribution claim. Use the shared
        period and the dated crawl, run, and analytics records to evaluate what
        changed after each content or technical release.
      </div>
    </section>
  );
}

export function ShareOfVoicePage({ project }: { project: Project }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = readQueryParam(searchParams, "period", periods, "30d");
  const reportQuery = useQuery({
    queryKey: tenantQueryKey("share-of-voice", project.id, period),
    queryFn: () =>
      api<ShareOfVoiceReport>(
        `/projects/${project.id}/share-of-voice?period=${period}`,
      ),
    refetchInterval: 30_000,
  });
  const referralsQuery = useQuery({
    queryKey: tenantQueryKey("ai-referrals", project.id, period),
    queryFn: () =>
      api<AiReferralsResponse>(
        `/projects/${project.id}/ai-referrals?period=${period}`,
      ),
    retry: false,
    staleTime: 5 * 60 * 1_000,
  });
  const crawlerQuery = useQuery({
    queryKey: tenantQueryKey("crawler-traffic-history", project.id),
    queryFn: () =>
      api<CrawlerTrafficHistoryData>(
        `/projects/${project.id}/crawler-traffic/history`,
      ),
    retry: false,
    staleTime: 5 * 60 * 1_000,
  });
  const opportunitiesQuery = useQuery({
    queryKey: tenantQueryKey("opportunities", project.id, "open"),
    queryFn: () =>
      api<{ opportunities: Opportunity[] }>(
        `/opportunities?projectId=${encodeURIComponent(project.id)}&status=open`,
      ),
    staleTime: 60_000,
  });

  return (
    <div className="page-shell">
      <PageHeader
        title="Share of Voice"
        description={`Why ${project.name} wins or loses across answer engines—and what to do next.`}
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

      {reportQuery.isError ? (
        <ErrorState
          message={`Share of Voice could not be loaded. ${(reportQuery.error as Error).message}`}
          onRetry={() => void reportQuery.refetch()}
          retrying={reportQuery.isFetching}
        />
      ) : null}
      {reportQuery.isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <LoadingBlock key={index} className="h-32" />
            ))}
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
            <LoadingBlock className="h-80" />
            <LoadingBlock className="h-80" />
          </div>
        </>
      ) : reportQuery.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Share of voice"
              value={`${reportQuery.data.overview.share}%`}
              detail={`${reportQuery.data.overview.mentions} of ${reportQuery.data.overview.totalMentions} tracked mentions`}
              icon={<Sparkles className="size-4" />}
            />
            <MetricCard
              label="Previous period"
              value={
                reportQuery.data.overview.previousShare === null
                  ? unknownValue
                  : `${reportQuery.data.overview.previousShare}%`
              }
              detail={<Change value={reportQuery.data.overview.change} />}
              icon={<Activity className="size-4" />}
            />
            <MetricCard
              label="Leaderboard rank"
              value={`#${reportQuery.data.overview.rank}`}
              detail={`Among ${reportQuery.data.overview.trackedBrands} mentioned brands`}
              icon={<Trophy className="size-4" />}
            />
            <MetricCard
              label="Score confidence"
              value={`${reportQuery.data.confidence.completionRate}%`}
              detail={
                <span className="flex flex-wrap items-center gap-2">
                  <ConfidenceBadge level={reportQuery.data.confidence.level} />
                  <span>
                    {reportQuery.data.confidence.successfulRuns} successful ·{" "}
                    {reportQuery.data.confidence.failedRuns} failed
                  </span>
                </span>
              }
              icon={<Gauge className="size-4" />}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
            <ShareTrend report={reportQuery.data} project={project} />
            <Leaderboard report={reportQuery.data} project={project} />
          </div>
          <EngineBreakdown report={reportQuery.data} />
          <PromptBreakdown report={reportQuery.data} />
          <CitationOwnership report={reportQuery.data} />
          <CompetitorGaps report={reportQuery.data} />
          <OpportunityInbox
            opportunities={opportunitiesQuery.data?.opportunities ?? []}
            pending={opportunitiesQuery.isPending}
            error={
              opportunitiesQuery.isError
                ? (opportunitiesQuery.error as Error)
                : null
            }
          />
          <MeasurementLoop
            report={reportQuery.data}
            referrals={referralsQuery.data}
            referralsPending={referralsQuery.isPending}
            crawlerHistory={crawlerQuery.data}
            crawlerPending={crawlerQuery.isPending}
          />
        </>
      ) : null}
    </div>
  );
}

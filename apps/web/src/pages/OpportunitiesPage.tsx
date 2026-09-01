import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CheckSquare2,
  Circle,
  CircleAlert,
  ExternalLink,
  FileWarning,
  Inbox,
  Link2,
  ListChecks,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { api, tenantQueryKey } from "../api";
import type {
  Opportunity,
  OpportunityStatus,
  OpportunityType,
  Project,
  Prompt,
} from "../types";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  ProviderBadge,
  formatDate,
  formatRelative,
} from "../components/ui";
import { readQueryParam, updateQueryParam } from "../url-search-params";

const opportunityStatuses = [
  "open",
  "in_progress",
  "resolved",
  "dismissed",
  "all",
] as const satisfies readonly (OpportunityStatus | "all")[];

const opportunityTypes = [
  "all",
  "citation_gap",
  "content_authority",
  "winning_message",
  "competitor_advantage",
  "unsupported_claim",
  "reliability_warning",
] as const satisfies readonly (OpportunityType | "all")[];

type OpportunityUpdate = {
  status?: OpportunityStatus;
  completedActionIndices?: number[];
  dueAt?: string | null;
  relatedOpportunityIds?: string[];
};

type GroupedOpportunity = Opportunity & { relatedOpportunityIds: string[] };

function groupOpportunities(rows: Opportunity[]): GroupedOpportunity[] {
  const groups = new Map<string, GroupedOpportunity>();
  for (const row of rows) {
    const key = [row.type, row.title, row.recommendedAction]
      .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
      .join("\u0000");
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { ...row, relatedOpportunityIds: [] });
      continue;
    }
    const unique = <T,>(values: T[]) => [...new Set(values)];
    groups.set(key, {
      ...current,
      priority: Math.max(current.priority, row.priority),
      confidence: Math.max(current.confidence, row.confidence),
      earlySignal: current.earlySignal || row.earlySignal,
      evidenceIds: unique([...current.evidenceIds, ...row.evidenceIds]),
      affectedPromptIds: unique([
        ...current.affectedPromptIds,
        ...row.affectedPromptIds,
      ]),
      affectedUrls: unique([...current.affectedUrls, ...row.affectedUrls]),
      completedActionIndices: unique([
        ...current.completedActionIndices,
        ...row.completedActionIndices,
      ]).sort(),
      dueAt:
        [current.dueAt, row.dueAt]
          .filter((date): date is string => Boolean(date))
          .sort()[0] ?? null,
      evidenceSummaries: [
        ...current.evidenceSummaries,
        ...row.evidenceSummaries.filter(
          (evidence) =>
            !current.evidenceSummaries.some(
              (existing) => existing.runId === evidence.runId,
            ),
        ),
      ],
      firstSeenAt:
        current.firstSeenAt < row.firstSeenAt
          ? current.firstSeenAt
          : row.firstSeenAt,
      lastSeenAt:
        current.lastSeenAt > row.lastSeenAt
          ? current.lastSeenAt
          : row.lastSeenAt,
      relatedOpportunityIds: unique([...current.relatedOpportunityIds, row.id]),
    });
  }
  return [...groups.values()];
}

const typeDetails: Record<
  OpportunityType,
  { label: string; icon: typeof Target; className: string }
> = {
  citation_gap: {
    label: "Citation gap",
    icon: Link2,
    className: "bg-warning/15 text-warning",
  },
  content_authority: {
    label: "Content authority",
    icon: Target,
    className: "bg-primary/15 text-primary",
  },
  winning_message: {
    label: "Winning message",
    icon: Trophy,
    className: "bg-success/15 text-success",
  },
  competitor_advantage: {
    label: "Competitor advantage",
    icon: ShieldAlert,
    className: "bg-error/15 text-error",
  },
  unsupported_claim: {
    label: "Unsupported claim",
    icon: FileWarning,
    className: "bg-warning/15 text-warning",
  },
  reliability_warning: {
    label: "Reliability warning",
    icon: CircleAlert,
    className: "bg-error/15 text-error",
  },
};

function priorityLabel(priority: number): string {
  if (priority >= 85) return "High priority";
  if (priority >= 70) return "Medium priority";
  return "Monitor";
}

function nextStatus(status: OpportunityStatus): OpportunityStatus {
  if (status === "open") return "in_progress";
  if (status === "in_progress") return "resolved";
  return "open";
}

function statusAction(status: OpportunityStatus) {
  if (status === "open") {
    return { label: "Mark in progress", icon: CheckSquare2 };
  }
  if (status === "in_progress") {
    return { label: "Mark resolved", icon: CheckCircle2 };
  }
  return { label: "Reopen", icon: RotateCcw };
}

const actionPlans: Record<OpportunityType, string[]> = {
  citation_gap: [
    "Audit the cited competitor sources",
    "Create or update an owned page that answers the prompt directly",
    "Add verifiable first-party evidence",
    "Validate the change in the next tracked answer",
  ],
  content_authority: [
    "Identify the owned page that should be cited",
    "Add primary proof for the answer's key claims",
    "Make the direct answer easy to extract",
    "Validate the citation in the next tracked answer",
  ],
  winning_message: [
    "Open the cited owned page and identify the winning proof",
    "Reuse that proof on an adjacent high-intent page",
    "Add a closely related tracked prompt",
    "Confirm that the message keeps winning",
  ],
  competitor_advantage: [
    "Compare your answer with the cited competitors",
    "Add a direct answer to the tracked prompt",
    "Support your differentiators with first-party proof",
    "Validate the change in the next tracked answer",
  ],
  unsupported_claim: [
    "Review the unsupported claims in the evidence",
    "Publish primary evidence for each material claim",
    "Link the evidence from the most relevant owned page",
    "Validate that answer engines cite the proof",
  ],
  reliability_warning: [
    "Open a failed run and review the provider error",
    "Check whether failures affect one model or every target",
    "Retry a representative prompt after the provider recovers",
    "Treat visibility changes as valid only after a successful run",
  ],
};

const briefOutlines: Record<OpportunityType, string[]> = {
  citation_gap: [
    "Direct answer to the tracked prompt",
    "Evidence and methodology",
    "How this differs from cited alternatives",
  ],
  content_authority: [
    "Direct answer and key takeaway",
    "First-party methodology and proof",
    "Frequently asked follow-up questions",
  ],
  winning_message: [
    "The proven answer and supporting evidence",
    "Adjacent use cases",
    "Frequently asked follow-up questions",
  ],
  competitor_advantage: [
    "What the current answers get right",
    "Where your approach is different",
    "Proof, methodology, and limitations",
  ],
  unsupported_claim: [
    "Claims answer engines are repeating",
    "Primary evidence for each claim",
    "Methodology, dates, and limitations",
  ],
  reliability_warning: [
    "Affected providers and models",
    "Representative failure details",
    "Recovery and validation procedure",
  ],
};

const slugStopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "best",
  "for",
  "how",
  "is",
  "of",
  "source",
  "the",
  "to",
  "way",
  "what",
]);

function parsedUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function topicSlug(prompt: string, projectName: string): string {
  const brandWords = new Set(
    projectName.toLowerCase().match(/[a-z0-9]+/g) ?? [],
  );
  const words = prompt.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const topicWords = words.filter(
    (word) => !slugStopWords.has(word) && !brandWords.has(word),
  );
  return topicWords.slice(0, 6).join("-") || "answer-guide";
}

function recommendedPage(
  opportunity: Opportunity,
  project: Project,
  prompt: Prompt | undefined,
): { url: string; isNew: boolean } {
  const host = projectHost(project.website);
  const ownedUrl = opportunity.affectedUrls.find((value) => {
    const candidate = parsedUrl(value);
    return (
      candidate?.hostname === host || candidate?.hostname.endsWith(`.${host}`)
    );
  });
  if (ownedUrl) return { url: ownedUrl, isNew: false };
  if (!prompt || opportunity.type === "reliability_warning") {
    return { url: project.website, isNew: false };
  }
  const base = new URL(project.website);
  base.pathname = `/guides/${topicSlug(prompt.value, project.name)}`;
  base.search = "";
  base.hash = "";
  return { url: base.toString().replace(/\/$/, ""), isNew: true };
}

function sourceDomains(urls: string[]): string[] {
  return [
    ...new Set(
      urls
        .map((url) => parsedUrl(url)?.hostname.replace(/^www\./, ""))
        .filter((domain): domain is string => Boolean(domain)),
    ),
  ];
}

function projectHost(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return website;
  }
}

export function OpportunitiesPage({ project }: { project: Project }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = readQueryParam(
    searchParams,
    "status",
    opportunityStatuses,
    "open",
  );
  const type = readQueryParam(searchParams, "type", opportunityTypes, "all");
  const queryClient = useQueryClient();
  const queryKey = tenantQueryKey("opportunities", project.id, status, type);
  const query = useQuery({
    queryKey,
    queryFn: () => {
      const parameters = new URLSearchParams({ projectId: project.id, status });
      if (type !== "all") parameters.set("type", type);
      return api<{ opportunities: Opportunity[] }>(
        `/opportunities?${parameters.toString()}`,
      );
    },
  });
  const promptsQuery = useQuery({
    queryKey: tenantQueryKey("prompts", project.id),
    queryFn: () =>
      api<{ prompts: Prompt[] }>(`/projects/${project.id}/prompts`),
  });
  const mutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: OpportunityUpdate }) =>
      api<{ ok: true }>(`/opportunities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey("opportunities", project.id),
      }),
  });
  const rawRows = query.data?.opportunities ?? [];
  const rows = useMemo(() => groupOpportunities(rawRows), [rawRows]);
  const promptsById = useMemo(
    () =>
      new Map(
        (promptsQuery.data?.prompts ?? []).map((prompt) => [prompt.id, prompt]),
      ),
    [promptsQuery.data?.prompts],
  );
  const summary = useMemo(
    () => ({
      visible: rows.length,
      highPriority: rows.filter((item) => item.priority >= 85).length,
      earlySignals: rows.filter((item) => item.earlySignal).length,
    }),
    [rows],
  );

  return (
    <div className="page-shell">
      <PageHeader
        title="Opportunity Inbox"
        description={`Evidence-backed actions for ${project.name}, ranked by impact and confidence.`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-base-content/50">
              Visible opportunities
            </p>
            <Inbox className="size-4 text-base-content/35" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{summary.visible}</p>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-base-content/50">High priority</p>
            <CircleAlert className="size-4 text-error" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{summary.highPriority}</p>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-base-content/50">Early signals</p>
            <Sparkles className="size-4 text-warning" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{summary.earlySignals}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label className="form-control w-full sm:max-w-48">
          <span className="sr-only">Opportunity status</span>
          <select
            className="select select-sm border-base-300 bg-base-100"
            value={status}
            onChange={(event) =>
              setSearchParams(
                updateQueryParam(
                  searchParams,
                  "status",
                  event.target.value,
                  "open",
                ),
              )
            }
          >
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All statuses</option>
          </select>
        </label>
        <label className="form-control w-full sm:max-w-56">
          <span className="sr-only">Opportunity type</span>
          <select
            className="select select-sm border-base-300 bg-base-100"
            value={type}
            onChange={(event) =>
              setSearchParams(
                updateQueryParam(
                  searchParams,
                  "type",
                  event.target.value,
                  "all",
                ),
              )
            }
          >
            <option value="all">All opportunity types</option>
            {Object.entries(typeDetails).map(([value, details]) => (
              <option key={value} value={value}>
                {details.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {query.isError ? (
        <ErrorState message={(query.error as Error).message} />
      ) : null}
      {mutation.isError ? (
        <div className="mb-4">
          <ErrorState message={(mutation.error as Error).message} />
        </div>
      ) : null}
      {query.isPending ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <LoadingBlock className="h-80" />
          <LoadingBlock className="h-80" />
        </div>
      ) : rows.length ? (
        <section className="space-y-3" aria-label="Opportunities">
          {rows.map((opportunity) => {
            const details = typeDetails[opportunity.type];
            const Icon = details.icon;
            const action = statusAction(opportunity.status);
            const ActionIcon = action.icon;
            const affectedPrompts = opportunity.affectedPromptIds
              .map((id) => promptsById.get(id))
              .filter((prompt): prompt is Prompt => Boolean(prompt));
            const evidenceRunId = opportunity.evidenceIds[0];
            const primaryPrompt = affectedPrompts[0];
            const page = recommendedPage(opportunity, project, primaryPrompt);
            const proofSources = sourceDomains(opportunity.affectedUrls);
            return (
              <article
                key={opportunity.id}
                className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-lg ${details.className}`}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold uppercase tracking-wide text-base-content/45">
                        {details.label}
                      </p>
                      <p className="text-xs text-base-content/40">
                        Seen {formatRelative(opportunity.lastSeenAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {opportunity.evidenceIds.length > 1 ? (
                      <span className="badge badge-primary badge-outline badge-sm whitespace-nowrap">
                        {opportunity.evidenceIds.length} observations grouped
                      </span>
                    ) : null}
                    {opportunity.earlySignal ? (
                      <span className="badge badge-warning badge-sm whitespace-nowrap">
                        Early signal
                      </span>
                    ) : null}
                  </div>
                </div>

                <h2 className="mt-4 text-xl font-semibold tracking-tight">
                  {opportunity.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-base-content/55">
                  <span>{opportunity.explanation}</span>
                  <span className="font-medium text-primary">
                    {priorityLabel(opportunity.priority)} ·{" "}
                    {opportunity.priority}
                  </span>
                  <span>{opportunity.confidence}% confidence</span>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
                  <div className="space-y-3">
                    <div className="rounded-lg border border-base-300 bg-base-200/35 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-base-content/45">
                        Target prompt
                      </p>
                      {affectedPrompts.length ? (
                        <div className="mt-2 space-y-2">
                          {affectedPrompts.slice(0, 2).map((prompt) => (
                            <p
                              key={prompt.id}
                              className="text-sm font-medium leading-6"
                            >
                              “{prompt.value}”
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-base-content/60">
                          {opportunity.type === "reliability_warning"
                            ? "Provider reliability across recent tracked runs"
                            : "Prompt details are unavailable"}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-base-300 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-base-content/45">
                          Recommended page
                        </p>
                        <span
                          className={`badge badge-sm ${page.isNew ? "badge-primary" : "badge-ghost"}`}
                        >
                          {page.isNew ? "New page" : "Existing page"}
                        </span>
                      </div>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 flex items-center gap-1.5 break-all text-sm font-medium text-primary hover:underline"
                      >
                        {page.url}
                        <ExternalLink className="size-3.5 shrink-0" />
                      </a>
                    </div>

                    <div className="rounded-lg border border-base-300 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-base-content/45">
                        What success looks like
                      </p>
                      <p className="mt-2 text-sm leading-6">
                        {opportunity.recommendedAction}
                      </p>
                      <p className="mt-3 text-xs text-base-content/50">
                        Work on {projectHost(project.website)}, then confirm the
                        result in fresh evidence.
                      </p>
                    </div>

                    {opportunity.affectedUrls.length ? (
                      <div className="rounded-lg border border-base-300 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-base-content/45">
                          Sources to review
                        </p>
                        <div className="mt-2 space-y-1.5">
                          {opportunity.affectedUrls.slice(0, 3).map((url) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 truncate text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="size-3 shrink-0" />
                              <span className="truncate">{url}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {opportunity.evidenceSummaries[0] ? (
                      <div className="rounded-lg border border-base-300 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-base-content/45">
                            Supporting answer
                          </p>
                          <div className="flex items-center gap-2">
                            <ProviderBadge
                              provider={
                                opportunity.evidenceSummaries[0].provider
                              }
                              model={opportunity.evidenceSummaries[0].model}
                            />
                            <span className="text-xs text-base-content/45">
                              {formatDate(
                                opportunity.evidenceSummaries[0].createdAt,
                              )}
                            </span>
                          </div>
                        </div>
                        <blockquote className="mt-3 border-l-2 border-primary/35 pl-3 text-sm leading-6 text-base-content/70">
                          {opportunity.evidenceSummaries[0].answerExcerpt}
                        </blockquote>
                        {opportunity.evidenceSummaries.length > 1 ? (
                          <p className="mt-2 text-xs text-base-content/45">
                            +{opportunity.evidenceSummaries.length - 1} more
                            supporting answers
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ListChecks className="size-4 text-primary" />
                        <p className="text-xs font-semibold uppercase tracking-wide text-base-content/55">
                          Action plan
                        </p>
                      </div>
                      <span className="text-xs font-medium text-primary">
                        {opportunity.completedActionIndices.length} of 4
                        complete
                      </span>
                    </div>
                    <ol className="mt-3 space-y-3">
                      {actionPlans[opportunity.type].map((step, index) => (
                        <li key={step} className="flex gap-3 text-sm leading-5">
                          <button
                            type="button"
                            className="shrink-0 text-primary disabled:opacity-50"
                            aria-label={`${opportunity.completedActionIndices.includes(index) ? "Mark action" : "Mark action"} ${index + 1} ${opportunity.completedActionIndices.includes(index) ? "incomplete" : "complete"}`}
                            disabled={mutation.isPending}
                            onClick={() => {
                              const completed = new Set(
                                opportunity.completedActionIndices,
                              );
                              if (completed.has(index)) completed.delete(index);
                              else completed.add(index);
                              mutation.mutate({
                                id: opportunity.id,
                                update: {
                                  completedActionIndices: [...completed].sort(),
                                  relatedOpportunityIds:
                                    opportunity.relatedOpportunityIds,
                                },
                              });
                            }}
                          >
                            {opportunity.completedActionIndices.includes(
                              index,
                            ) ? (
                              <CheckCircle2 className="size-5" />
                            ) : (
                              <Circle className="size-5" />
                            )}
                          </button>
                          <span
                            className={
                              opportunity.completedActionIndices.includes(index)
                                ? "text-base-content/45 line-through"
                                : undefined
                            }
                          >
                            {step}
                          </span>
                        </li>
                      ))}
                    </ol>

                    <label className="mt-5 block border-t border-primary/15 pt-4">
                      <span className="text-xs font-medium text-base-content/45">
                        Due date
                      </span>
                      <input
                        type="date"
                        className="input input-sm mt-1.5 w-full border-base-300 bg-base-100"
                        value={opportunity.dueAt?.slice(0, 10) ?? ""}
                        disabled={mutation.isPending}
                        onChange={(event) =>
                          mutation.mutate({
                            id: opportunity.id,
                            update: {
                              dueAt: event.target.value
                                ? `${event.target.value}T00:00:00.000Z`
                                : null,
                              relatedOpportunityIds:
                                opportunity.relatedOpportunityIds,
                            },
                          })
                        }
                      />
                    </label>

                    <div className="mt-5 border-t border-primary/15 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-base-content/55">
                        Content brief
                      </p>
                      <div className="mt-3 space-y-4 text-sm">
                        <div>
                          <p className="text-xs font-medium text-base-content/45">
                            Suggested title
                          </p>
                          <p className="mt-1 font-medium leading-5">
                            {primaryPrompt?.value.replace(/\?$/, "") ??
                              opportunity.title}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-base-content/45">
                            Outline
                          </p>
                          <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-5">
                            {briefOutlines[opportunity.type].map((section) => (
                              <li key={section}>{section}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-base-content/45">
                            Proof to include
                          </p>
                          <p className="mt-1 leading-5 text-base-content/70">
                            {proofSources.length
                              ? `Address the evidence currently surfaced by ${proofSources.join(", ")}, then add dated first-party data and methodology.`
                              : "Add dated first-party data, methodology, and links to primary sources."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
                  <div>
                    {evidenceRunId ? (
                      <Link
                        to={`../runs?run=${encodeURIComponent(evidenceRunId)}`}
                        className="btn btn-ghost btn-sm text-primary"
                      >
                        <ExternalLink className="size-3.5" />
                        View {opportunity.evidenceIds.length} supporting{" "}
                        {opportunity.evidenceIds.length === 1
                          ? "answer"
                          : "answers"}
                      </Link>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {opportunity.status === "open" ||
                    opportunity.status === "in_progress" ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={mutation.isPending}
                        onClick={() =>
                          mutation.mutate({
                            id: opportunity.id,
                            update: {
                              status: "dismissed",
                              relatedOpportunityIds:
                                opportunity.relatedOpportunityIds,
                            },
                          })
                        }
                      >
                        Dismiss
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          id: opportunity.id,
                          update: {
                            status: nextStatus(opportunity.status),
                            relatedOpportunityIds:
                              opportunity.relatedOpportunityIds,
                          },
                        })
                      }
                    >
                      {action.label} <ActionIcon className="size-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          title="No opportunities in this view"
          description="New evidence-backed actions appear after tracked prompts finish or provider reliability changes."
        />
      )}
    </div>
  );
}

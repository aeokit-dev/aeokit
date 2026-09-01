import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api, tenantQueryKey } from "../api";
import type {
  Competitor,
  CompetitorDiscoveryResponse,
  CompetitorSuggestion,
  Project,
} from "../types";
import { Modal } from "../components/Modal";
import {
  summarizeCompetitorChanges,
  type CompetitorChangeSummary,
} from "../competitor-discovery";
import {
  EmptyState,
  ErrorState,
  FilteredEmptyState,
  LoadingBlock,
  PageHeader,
  unknownValue,
} from "../components/ui";

export function isSafeWebsiteUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function CompetitorsPage({
  project,
  projectBasePath,
}: {
  project: Project;
  projectBasePath: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<"30d" | "90d" | "365d" | "all">("90d");
  const [minimumMentions, setMinimumMentions] = useState(2);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [changeSummary, setChangeSummary] =
    useState<CompetitorChangeSummary | null>(null);
  const query = useQuery({
    queryKey: tenantQueryKey("project", project.id),
    queryFn: () =>
      api<{ project: Project & { competitors: Competitor[] } }>(
        `/projects/${project.id}`,
      ),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/competitors/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey("project", project.id),
      }),
  });
  const competitors = query.data?.project.competitors ?? [];
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return competitors;
    return competitors.filter((competitor) =>
      [
        competitor.name,
        competitor.website ?? "",
        ...competitor.aliases,
        ...competitor.domains,
      ].some((value) => value.toLowerCase().includes(term)),
    );
  }, [competitors, search]);
  const suggestionsQuery = useQuery({
    queryKey: tenantQueryKey(
      "competitor-suggestions",
      project.id,
      range,
      minimumMentions,
    ),
    queryFn: () =>
      api<CompetitorDiscoveryResponse>(
        `/projects/${project.id}/competitor-suggestions?range=${range}&minimumMentions=${minimumMentions}`,
      ),
  });
  const refresh = useMutation({
    mutationFn: () =>
      api<CompetitorDiscoveryResponse>(
        `/projects/${project.id}/competitor-suggestions/reanalyze`,
        {
          method: "POST",
          body: JSON.stringify({ range, minimumMentions }),
        },
      ),
    onSuccess: (data) => {
      setChangeSummary(
        summarizeCompetitorChanges(suggestions, data.suggestions),
      );
      queryClient.setQueryData(
        tenantQueryKey(
          "competitor-suggestions",
          project.id,
          range,
          minimumMentions,
        ),
        data,
      );
    },
  });
  const approve = useMutation({
    mutationFn: (suggestions: CompetitorSuggestion[]) =>
      api(`/projects/${project.id}/competitor-suggestions/approve`, {
        method: "POST",
        body: JSON.stringify({ suggestions }),
      }),
    onSuccess: () => {
      setSelected([]);
      setChangeSummary(null);
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey("project", project.id),
      });
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey("competitor-suggestions", project.id),
      });
    },
  });
  const dismiss = useMutation({
    mutationFn: (suggestion: CompetitorSuggestion) =>
      api(
        `/projects/${project.id}/competitor-suggestions/${suggestion.key}/dismiss`,
        {
          method: "POST",
          body: JSON.stringify({
            mentionCount: suggestion.mentionCount,
            promptCount: suggestion.promptCount,
            providerCount: suggestion.providerCount,
            evidenceRunIds: suggestion.evidence
              .slice(-500)
              .map((item) => item.runId),
            evidencePromptIds: [
              ...new Set(suggestion.evidence.map((item) => item.promptId)),
            ].slice(-500),
            evidenceProviders: [
              ...new Set(suggestion.evidence.map((item) => item.provider)),
            ].slice(-20),
          }),
        },
      ),
    onSuccess: (_data, suggestion) => {
      setChangeSummary(null);
      setSelected((current) => current.filter((key) => key !== suggestion.key));
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey("competitor-suggestions", project.id),
      });
    },
  });
  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  const approveSelected = () => {
    const values = suggestions.filter((item) => selected.includes(item.key));
    if (
      values.length &&
      window.confirm(
        `Add ${values.length} competitor${values.length === 1 ? "" : "s"}? This adds no prompts or provider-query cost.`,
      )
    )
      approve.mutate(values);
  };
  return (
    <div className="page-shell">
      <PageHeader
        title="Competitors"
        description="Brands included in mention detection and share-of-voice calculations."
        actions={
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-4" />
            Add competitor
          </button>
        }
      />
      <section className="data-panel mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-4">
          <div>
            <h2 className="font-semibold">Discovered competitors</h2>
            <p className="text-sm text-base-content/55">
              Suggested from stored AI answers. Reanalysis does not run paid
              provider queries.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="select select-bordered select-sm"
              aria-label="History range"
              value={range}
              onChange={(event) => {
                setRange(event.target.value as typeof range);
                setChangeSummary(null);
                setSelected([]);
              }}
            >
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="365d">365 days</option>
              <option value="all">All history</option>
            </select>
            <select
              className="select select-bordered select-sm"
              aria-label="Minimum mentions"
              value={minimumMentions}
              onChange={(event) => {
                setMinimumMentions(Number(event.target.value));
                setChangeSummary(null);
                setSelected([]);
              }}
            >
              {[2, 3, 4, 5, 10].map((count) => (
                <option key={count} value={count}>
                  {count}+ mentions
                </option>
              ))}
            </select>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              <RefreshCw
                className={`size-4 ${refresh.isPending ? "animate-spin" : ""}`}
              />{" "}
              Reanalyze history
            </button>
            <a
              className="btn btn-ghost btn-sm"
              href={`${projectBasePath}/prompts`}
              title="Open Prompts to run fresh provider queries, which may incur cost"
            >
              Run fresh queries
            </a>
            {selected.length ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={approveSelected}
                disabled={approve.isPending}
              >
                <Check className="size-4" />
                Approve {selected.length}
              </button>
            ) : null}
          </div>
        </div>
        <div className="px-4 py-3 text-xs text-base-content/50">
          {suggestionsQuery.isSuccess
            ? (suggestionsQuery.data?.answersAnalyzed ?? 0)
            : unknownValue}{" "}
          stored answers analyzed · $0 provider-query cost · approving adds 0
          runs
        </div>
        {changeSummary ? (
          <div
            className="mx-4 mb-3 rounded-lg border border-info/30 bg-info/10 p-3 text-sm"
            role="status"
          >
            <strong>Reanalysis preview:</strong>{" "}
            {changeSummary.newlyDiscovered.length} newly discovered,{" "}
            {changeSummary.removed.length} removed, and{" "}
            {changeSummary.confidenceChanged.length} confidence changed. Review
            the suggestions below before approving any competitor-list changes.
          </div>
        ) : null}
        {suggestionsQuery.isError ? (
          <div className="p-4">
            <ErrorState
              message={`Competitor suggestions could not be loaded. ${(suggestionsQuery.error as Error).message}`}
              onRetry={() => void suggestionsQuery.refetch()}
              retrying={suggestionsQuery.isFetching}
            />
          </div>
        ) : suggestionsQuery.isPending ? (
          <LoadingBlock className="h-40" />
        ) : suggestions.length ? (
          <div className="divide-y divide-base-300">
            {suggestions.map((suggestion) => (
              <article key={suggestion.key} className="p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm mt-1"
                    aria-label={`Select ${suggestion.name}`}
                    checked={selected.includes(suggestion.key)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, suggestion.key]
                          : current.filter((key) => key !== suggestion.key),
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="max-w-full break-words font-medium">
                        {suggestion.name}
                      </h3>
                      <span
                        className={`badge badge-sm ${suggestion.confidence === "high" ? "badge-success" : "badge-ghost"}`}
                      >
                        {suggestion.confidenceScore}% confidence
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-base-content/60">
                      Mentioned {suggestion.mentionCount} times (
                      {suggestion.mentionPercentage}%) across{" "}
                      {suggestion.promptCount} prompts and{" "}
                      {suggestion.providerCount} providers.
                    </p>
                    {suggestion.aliases.length ? (
                      <p className="mt-1 break-words text-xs text-base-content/50">
                        Also seen as: {suggestion.aliases.join(", ")}
                      </p>
                    ) : null}
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-primary">
                        Why this was suggested
                      </summary>
                      <div className="mt-2 space-y-2">
                        {suggestion.evidence.map((evidence) => (
                          <div
                            key={evidence.runId}
                            className="rounded bg-base-200 p-3"
                          >
                            <div className="text-xs font-medium">
                              {evidence.provider} / {evidence.model} ·{" "}
                              {evidence.prompt}
                            </div>
                            <p className="mt-1 break-words text-base-content/65">
                              {evidence.excerpt}
                            </p>
                            <a
                              className="link link-primary mt-1 inline-block text-xs"
                              href={`${projectBasePath}/runs?run=${encodeURIComponent(evidence.runId)}`}
                            >
                              View underlying run
                            </a>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm shrink-0"
                    onClick={() => dismiss.mutate(suggestion)}
                    disabled={dismiss.isPending}
                    title={`Dismiss ${suggestion.name}`}
                  >
                    <X className="size-4" />
                    Dismiss
                  </button>
                  <button
                    className="btn btn-primary btn-sm shrink-0"
                    disabled={approve.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Add ${suggestion.name}? This adds no prompts or provider-query cost.`,
                        )
                      )
                        approve.mutate([suggestion]);
                    }}
                  >
                    <Check className="size-4" />
                    Approve
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No competitor suggestions"
            description="Suggestions appear after a brand is repeatedly mentioned across multiple stored prompt answers."
          />
        )}
        {refresh.isError || approve.isError || dismiss.isError ? (
          <div className="p-4 pt-0">
            <ErrorState
              message={
                ((refresh.error ?? approve.error ?? dismiss.error) as Error)
                  .message
              }
            />
          </div>
        ) : null}
      </section>
      {query.isError ? (
        <ErrorState message={(query.error as Error).message} />
      ) : null}
      {query.isPending ? (
        <LoadingBlock className="h-72" />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <label className="input input-sm flex w-full max-w-sm items-center gap-2 border-base-300">
              <Search className="size-4 text-base-content/40" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search competitors"
                className="grow"
              />
            </label>
            <div className="text-xs text-base-content/45">
              {rows.length} competitor{rows.length === 1 ? "" : "s"}
            </div>
          </div>
          <section className="data-panel">
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th className="w-full">Competitor</th>
                      <th>Aliases</th>
                      <th>Domains</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((competitor) => (
                      <tr key={competitor.id} className="hover:bg-base-200/35">
                        <td>
                          <div className="font-medium">{competitor.name}</div>
                          {competitor.website ? (
                            isSafeWebsiteUrl(competitor.website) ? (
                              <a
                                className="mt-0.5 flex items-center gap-1 text-xs text-base-content/40 hover:text-primary"
                                href={competitor.website}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {competitor.website}
                                <ExternalLink className="size-3" />
                              </a>
                            ) : (
                              <span className="mt-0.5 block text-xs text-base-content/40">
                                {competitor.website}
                              </span>
                            )
                          ) : null}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {competitor.aliases.length ? (
                              competitor.aliases.map((alias) => (
                                <span
                                  key={alias}
                                  className="badge badge-ghost badge-sm"
                                >
                                  {alias}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-base-content/35">
                                None
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {competitor.domains.map((domain) => (
                              <span
                                key={domain}
                                className="badge badge-ghost badge-sm font-mono"
                              >
                                {domain}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-square text-error"
                            aria-label={`Remove ${competitor.name}`}
                            title={`Remove ${competitor.name}`}
                            onClick={() => {
                              if (window.confirm(`Remove ${competitor.name}?`))
                                deleteMutation.mutate(competitor.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <FilteredEmptyState
                hasItems={Boolean(competitors.length)}
                hasActiveFilters={Boolean(search.trim())}
                emptyTitle="No competitors tracked"
                emptyDescription="Add competitors to calculate share of voice and classify their citations."
                filteredTitle="No matching competitors"
                filteredDescription="No competitors match your search."
                clearLabel="Clear search"
                onClear={() => setSearch("")}
                emptyAction={
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setOpen(true)}
                  >
                    Add competitor
                  </button>
                }
              />
            )}
          </section>
        </>
      )}
      <AddCompetitorModal
        open={open}
        project={project}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          queryClient.invalidateQueries({
            queryKey: tenantQueryKey("project", project.id),
          });
        }}
      />
    </div>
  );
}

export function AddCompetitorModal({
  open,
  project,
  onClose,
  onCreated,
}: {
  open: boolean;
  project: Project;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [aliases, setAliases] = useState("");
  const [domains, setDomains] = useState("");
  const websiteError =
    website && !isSafeWebsiteUrl(website)
      ? "Website must use an http:// or https:// URL."
      : null;
  const mutation = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}/competitors`, {
        method: "POST",
        body: JSON.stringify({
          name,
          website: website || null,
          aliases: aliases
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          domains: domains
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      }),
    onSuccess: () => {
      setName("");
      setWebsite("");
      setAliases("");
      setDomains("");
      onCreated();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (websiteError) return;
    mutation.mutate();
  };
  return (
    <Modal
      open={open}
      title="Add competitor"
      description="Names and domains are matched without using another model."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <fieldset className="fieldset">
          <label className="fieldset-legend" htmlFor="add-competitor-name">
            Name
          </label>
          <input
            id="add-competitor-name"
            className="input w-full border-base-300"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </fieldset>
        <fieldset className="fieldset">
          <label className="fieldset-legend" htmlFor="add-competitor-website">
            Website
          </label>
          <input
            id="add-competitor-website"
            className="input w-full border-base-300"
            type="url"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="https://competitor.com"
            aria-invalid={websiteError ? true : undefined}
            aria-describedby={
              websiteError ? "add-competitor-website-error" : undefined
            }
          />
          {websiteError ? (
            <p
              id="add-competitor-website-error"
              className="fieldset-label text-error"
            >
              {websiteError}
            </p>
          ) : null}
        </fieldset>
        <fieldset className="fieldset">
          <label className="fieldset-legend" htmlFor="add-competitor-aliases">
            Aliases
          </label>
          <input
            id="add-competitor-aliases"
            className="input w-full border-base-300"
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            placeholder="Short name, Previous name"
          />
          <p className="fieldset-label">Comma-separated</p>
        </fieldset>
        <fieldset className="fieldset">
          <label className="fieldset-legend" htmlFor="add-competitor-domains">
            Domains
          </label>
          <input
            id="add-competitor-domains"
            className="input w-full border-base-300 font-mono text-sm"
            value={domains}
            onChange={(event) => setDomains(event.target.value)}
            placeholder="competitor.com, docs.competitor.com"
          />
          <p className="fieldset-label">Comma-separated</p>
        </fieldset>
        {mutation.isError ? (
          <ErrorState message={(mutation.error as Error).message} />
        ) : null}
        <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Adding…" : "Add competitor"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

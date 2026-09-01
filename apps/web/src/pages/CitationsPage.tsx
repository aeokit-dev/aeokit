import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, tenantQueryKey } from "../api";
import type { Citation, CitationSurfaceCoverage, Project } from "../types";
import {
  readQueryParam,
  readQueryText,
  updateQueryParam,
} from "../url-search-params";
import {
  FilteredEmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  ProviderBadge,
  formatRelative,
  unknownValue,
} from "../components/ui";

const categories = [
  "all",
  "owned",
  "competitor",
  "social",
  "institutional",
  "other",
] as const;

const categoryClasses: Record<Citation["category"], string> = {
  owned: "bg-success/15 text-success",
  competitor: "bg-warning/20 text-base-content/70",
  social: "bg-info/15 text-info",
  institutional: "bg-primary/15 text-primary",
  other: "bg-base-200 text-base-content/55",
};

function SurfaceCoverage({
  coverage,
}: {
  coverage: CitationSurfaceCoverage[];
}) {
  if (coverage.length === 0) return null;
  const silent = coverage.filter((entry) => entry.sourcesUnavailable);
  return (
    <section className="data-panel mb-4">
      <div className="border-b border-base-300 px-4 py-3">
        <h2 className="text-base font-semibold leading-tight">
          Sources by surface
        </h2>
        <p className="mt-0.5 text-xs text-base-content/45">
          {silent.length
            ? `${silent.map((entry) => `${entry.surface} (${entry.providerLabel})`).join(", ")} returned answers without sources, so ${silent.length === 1 ? "it contributes" : "they contribute"} no citations. Totals below cover every recorded answer, not the filtered list.`
            : "Every surface that returned answers also returned sources. Totals below cover every recorded answer, not the filtered list."}
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3">
        {coverage.map((entry) => (
          <article
            key={`${entry.provider}:${entry.model}`}
            className="p-4 outline outline-base-300 -outline-offset-[0.5px]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">
                  {entry.surface}
                </h3>
                <p className="truncate text-xs text-base-content/45">
                  {entry.providerLabel}
                </p>
              </div>
              {entry.sourcesUnavailable ? (
                <span className="badge badge-warning badge-sm shrink-0">
                  No sources
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-2xl font-semibold">{entry.citations}</p>
            <p className="mt-1 text-xs text-base-content/45">
              {entry.citations === 1 ? "citation" : "citations"} from{" "}
              {entry.successfulRuns}{" "}
              {entry.successfulRuns === 1 ? "answer" : "answers"} · all time
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CitationsPage({ project }: { project: Project }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = readQueryText(searchParams, "search");
  const category = readQueryParam(searchParams, "category", categories, "all");
  const query = useQuery({
    queryKey: tenantQueryKey("citations", project.id),
    queryFn: () =>
      api<{
        citations: Citation[];
        surfaceCoverage?: CitationSurfaceCoverage[];
      }>(`/projects/${project.id}/citations`),
  });
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data?.citations ?? []).filter(
      (citation) =>
        (category === "all" || citation.category === category) &&
        (!term ||
          [
            citation.domain,
            citation.url,
            citation.title ?? "",
            citation.promptValue,
          ].some((value) => value.toLowerCase().includes(term))),
    );
  }, [category, query.data, search]);
  const domains = new Set(rows.map((citation) => citation.domain)).size;
  const owned = rows.filter((citation) => citation.category === "owned").length;
  // Until the request resolves these are not zeros, they are unknown.
  const resolved = query.isSuccess;
  const metric = (value: number) => (resolved ? value : unknownValue);

  return (
    <div className="page-shell">
      <PageHeader
        title="Citations"
        description="The pages and domains answer engines use as evidence in tracked answers."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="metric-card">
          <p className="text-sm text-base-content/50">Total citations</p>
          <p className="mt-2 text-2xl font-semibold">{metric(rows.length)}</p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-base-content/50">Unique domains</p>
          <p className="mt-2 text-2xl font-semibold">{metric(domains)}</p>
        </div>
        <div className="metric-card">
          <p className="text-sm text-base-content/50">Owned citations</p>
          <p className="mt-2 text-2xl font-semibold">{metric(owned)}</p>
        </div>
      </div>
      <SurfaceCoverage
        coverage={resolved ? (query.data?.surfaceCoverage ?? []) : []}
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <label className="input input-sm flex w-full max-w-sm items-center gap-2 border-base-300">
          <Search className="size-4 text-base-content/40" />
          <input
            className="grow"
            value={search}
            onChange={(event) =>
              setSearchParams(
                updateQueryParam(searchParams, "search", event.target.value),
              )
            }
            placeholder="Search URLs and domains"
          />
        </label>
        <select
          className="select select-sm border-base-300"
          value={category}
          onChange={(event) =>
            setSearchParams(
              updateQueryParam(
                searchParams,
                "category",
                event.target.value,
                "all",
              ),
            )
          }
        >
          <option value="all">All categories</option>
          <option value="owned">Owned</option>
          <option value="competitor">Competitor</option>
          <option value="social">Social</option>
          <option value="institutional">Institutional</option>
          <option value="other">Other</option>
        </select>
      </div>
      {query.isError ? (
        <ErrorState
          message={`Citations could not be loaded. ${(query.error as Error).message}`}
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
                    <th className="w-full">Source</th>
                    <th>Category</th>
                    <th>Provider</th>
                    <th>Prompt</th>
                    <th>Found</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((citation) => (
                    <tr key={citation.id} className="hover:bg-base-200/35">
                      <td>
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group block max-w-xl"
                        >
                          <span className="flex items-center gap-1.5 font-medium group-hover:text-primary">
                            {citation.title || citation.domain}
                            <ExternalLink className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-base-content/40">
                            {citation.url}
                          </span>
                        </a>
                      </td>
                      <td>
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${categoryClasses[citation.category]}`}
                        >
                          {citation.category}
                        </span>
                      </td>
                      <td>
                        <ProviderBadge
                          provider={citation.provider}
                          model={citation.model}
                        />
                      </td>
                      <td>
                        <p
                          className="max-w-xs truncate text-base-content/55"
                          title={citation.promptValue}
                        >
                          {citation.promptValue}
                        </p>
                      </td>
                      <td className="whitespace-nowrap text-base-content/45">
                        {formatRelative(citation.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <FilteredEmptyState
              hasItems={Boolean(query.data?.citations.length)}
              hasActiveFilters={Boolean(search.trim()) || category !== "all"}
              emptyTitle="No citations yet"
              emptyDescription="Citations appear after a provider returns a grounded answer."
              filteredTitle="No matching citations"
              filteredDescription="No citations match your search and filters."
              onClear={() => {
                const withoutSearch = updateQueryParam(
                  searchParams,
                  "search",
                  "",
                );
                setSearchParams(
                  updateQueryParam(withoutSearch, "category", "all", "all"),
                );
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}

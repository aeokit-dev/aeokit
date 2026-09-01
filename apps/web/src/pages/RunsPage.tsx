import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, tenantQueryKey } from "../api";
import type { Project, Run, RunDetail } from "../types";
import { runDetailQueryOptions, runIdFromSearch } from "../run-detail-query";
import { MarkdownAnswer } from "../components/MarkdownAnswer";
import { Modal } from "../components/Modal";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  ProviderBadge,
  StatusBadge,
  formatDate,
  formatUsd,
  mentionOutcomeLabel,
} from "../components/ui";

export function RunsPage({
  project,
  showProviderCosts,
}: {
  project: Project;
  showProviderCosts: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    runIdFromSearch(searchParams),
  );
  const promptId = searchParams.get("promptId");
  const query = useQuery({
    queryKey: tenantQueryKey("runs", project.id, promptId),
    queryFn: () =>
      api<{ runs: Run[] }>(
        `/projects/${project.id}/runs${promptId ? `?promptId=${encodeURIComponent(promptId)}` : ""}`,
      ),
    refetchInterval: 20_000,
  });
  const detailQuery = useQuery(runDetailQueryOptions(selectedId));
  const selectedDetail =
    detailQuery.data?.run.id === selectedId ? detailQuery.data.run : null;
  const rows = query.data?.runs ?? [];
  const filteredPrompt = promptId ? rows[0]?.promptValue : null;
  return (
    <div className="page-shell">
      <PageHeader
        title={promptId ? "Prompt run history" : "Run History"}
        description={
          filteredPrompt ??
          (promptId
            ? "Every answer collected for this prompt."
            : "Every raw answer, mention decision, citation, and provider error in one auditable log.")
        }
        actions={
          promptId ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSearchParams({})}
            >
              View all runs
            </button>
          ) : undefined
        }
      />
      {query.isError ? (
        <ErrorState message={(query.error as Error).message} />
      ) : null}
      {query.isPending ? (
        <LoadingBlock className="h-80" />
      ) : (
        <section className="data-panel">
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="table table-sm min-w-[64rem]">
                <thead>
                  <tr>
                    <th className="w-[42%] min-w-80">Prompt</th>
                    <th className="min-w-56">Provider</th>
                    <th className="min-w-28">Status</th>
                    <th className="min-w-28">Mention</th>
                    <th className="min-w-24">Latency</th>
                    {showProviderCosts ? (
                      <th className="min-w-20">Cost</th>
                    ) : null}
                    <th className="min-w-40">Started</th>
                    <th className="w-12">
                      <span className="sr-only">View details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((run) => (
                    <tr
                      key={run.id}
                      className="cursor-pointer hover:bg-base-200/35"
                      onClick={() => setSelectedId(run.id)}
                    >
                      <td className="align-middle">
                        <p className="max-w-2xl truncate font-medium">
                          {run.promptValue}
                        </p>
                        {run.error ? (
                          <p
                            className="mt-1 max-w-2xl truncate text-xs text-error/75"
                            title={run.error}
                          >
                            {run.error}
                          </p>
                        ) : null}
                      </td>
                      <td className="align-middle whitespace-nowrap">
                        <ProviderBadge
                          provider={run.provider}
                          model={run.model}
                        />
                      </td>
                      <td className="align-middle whitespace-nowrap">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="align-middle whitespace-nowrap">
                        {mentionOutcomeLabel(run.status, run.brandMentioned) ===
                        "Mentioned" ? (
                          <span className="font-medium text-success">Yes</span>
                        ) : mentionOutcomeLabel(
                            run.status,
                            run.brandMentioned,
                          ) === "Not mentioned" ? (
                          <span className="text-base-content/40">No</span>
                        ) : (
                          <span className="text-base-content/40">Unknown</span>
                        )}
                      </td>
                      <td className="align-middle whitespace-nowrap font-mono text-xs text-base-content/50">
                        {run.latencyMs
                          ? `${(run.latencyMs / 1000).toFixed(1)}s`
                          : "—"}
                      </td>
                      {showProviderCosts ? (
                        <td className="align-middle whitespace-nowrap font-mono text-xs text-base-content/60">
                          {formatUsd(run.costUsd)}
                        </td>
                      ) : null}
                      <td className="align-middle whitespace-nowrap text-base-content/50">
                        {formatDate(run.createdAt)}
                      </td>
                      <td className="align-middle">
                        <button
                          type="button"
                          className="btn btn-ghost btn-square btn-sm"
                          aria-label={`View details for ${run.promptValue}`}
                          title="View run details"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(run.id);
                          }}
                        >
                          <ChevronRight className="size-4 text-base-content/45" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={promptId ? "No runs for this prompt" : "No runs yet"}
              description={
                promptId
                  ? "Run this prompt to create its first auditable answer."
                  : "Run a prompt to create the first auditable answer."
              }
            />
          )}
        </section>
      )}
      <Modal
        key={selectedId ?? "closed"}
        open={Boolean(selectedId)}
        title="Run details"
        description={
          selectedDetail?.promptValue ?? "Stored answer and extracted evidence"
        }
        size="xl"
        onClose={() => {
          setSelectedId(null);
          if (searchParams.has("run")) {
            const next = new URLSearchParams(searchParams);
            next.delete("run");
            setSearchParams(next, { replace: true });
          }
        }}
      >
        {detailQuery.isPending ? (
          <div className="p-5">
            <LoadingBlock className="h-72" />
          </div>
        ) : detailQuery.isError ? (
          <div className="p-5">
            <ErrorState message={(detailQuery.error as Error).message} />
          </div>
        ) : selectedDetail ? (
          <RunDetailContent
            run={selectedDetail}
            showProviderCosts={showProviderCosts}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function RunDetailContent({
  run,
  showProviderCosts,
}: {
  run: RunDetail;
  showProviderCosts: boolean;
}) {
  return (
    <div className="space-y-5 p-5">
      <section className="rounded-lg border border-base-300 bg-base-200/35 p-3">
        <p className="subtle-label">Prompt</p>
        <p className="mt-1 text-sm font-medium leading-5">{run.promptValue}</p>
        <p className="mt-2 break-all font-mono text-xs text-base-content/40">
          Run ID: {run.id}
        </p>
      </section>
      <div
        className={`grid gap-3 ${showProviderCosts ? "sm:grid-cols-6" : "sm:grid-cols-5"}`}
      >
        <div>
          <p className="subtle-label">Provider</p>
          <div className="mt-1.5">
            <ProviderBadge provider={run.provider} model={run.model} />
          </div>
        </div>
        <div>
          <p className="subtle-label">Status</p>
          <div className="mt-1.5">
            <StatusBadge status={run.status} />
          </div>
        </div>
        <div>
          <p className="subtle-label">Brand mention</p>
          <p className="mt-1 text-sm font-medium">
            {mentionOutcomeLabel(run.status, run.brandMentioned) === "Mentioned"
              ? "Yes"
              : mentionOutcomeLabel(run.status, run.brandMentioned) ===
                  "Not mentioned"
                ? "No"
                : "Unknown"}
          </p>
        </div>
        <div>
          <p className="subtle-label">Latency</p>
          <p className="mt-1 font-mono text-sm">
            {run.latencyMs ? `${(run.latencyMs / 1000).toFixed(1)}s` : "—"}
          </p>
        </div>
        <div>
          <p className="subtle-label">Attempts</p>
          <p className="mt-1 font-mono text-sm">{run.attemptCount}</p>
        </div>
        {showProviderCosts ? (
          <div>
            <p className="subtle-label">Provider cost</p>
            <p className="mt-1 font-mono text-sm">{formatUsd(run.costUsd)}</p>
          </div>
        ) : null}
      </div>
      {run.error ? <ErrorState message={run.error} /> : null}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Answer</h3>
        <div className="markdown-answer max-h-96 overflow-auto rounded-lg border border-base-300 bg-base-200/35 p-4 text-sm leading-6">
          {run.answer ? (
            <MarkdownAnswer>{run.answer}</MarkdownAnswer>
          ) : (
            "No answer stored."
          )}
        </div>
      </section>
      {run.webQueries.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Search queries</h3>
          <div className="flex flex-wrap gap-1.5">
            {run.webQueries.map((query) => (
              <span key={query} className="badge badge-ghost">
                {query}
              </span>
            ))}
          </div>
        </section>
      ) : null}
      <section>
        <h3 className="mb-2 text-sm font-semibold">
          Citations ({run.citations.length})
        </h3>
        {run.citations.length ? (
          <div className="divide-y divide-base-300 rounded-lg border border-base-300">
            {run.citations.map((citation) => (
              <a
                key={citation.id}
                href={citation.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-base-200/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {citation.title || citation.domain}
                  </span>
                  <span className="block truncate text-xs text-base-content/40">
                    {citation.url}
                  </span>
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-base-content/30" />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-base-content/45">
            No citations extracted.
          </p>
        )}
      </section>
    </div>
  );
}

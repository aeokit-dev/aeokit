import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api, tenantQueryKey } from "../api";
import type {
  Project,
  Prompt,
  PromptSuggestion,
  PromptSuggestionResponse,
  ProviderStatus,
} from "../types";
import { Modal } from "../components/Modal";
import { readQueryText, updateQueryParam } from "../url-search-params";
import {
  FilteredEmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  ProviderBadge,
  formatRelative,
  unknownValue,
} from "../components/ui";

const brightDataFallbackOptions: ProviderStatus["modelOptions"] = [
  { id: "chatgpt", label: "ChatGPT", maxPromptCharacters: 2_000 },
  { id: "perplexity", label: "Perplexity", maxPromptCharacters: 2_000 },
  { id: "gemini", label: "Gemini", maxPromptCharacters: 2_000 },
  {
    id: "google-ai-mode",
    label: "Google AI Mode",
    maxPromptCharacters: 2_000,
  },
  {
    id: "google-ai-overview",
    label: "Google AI Overview",
    maxPromptCharacters: 2_000,
  },
  {
    id: "bing-copilot",
    label: "Bing Copilot",
    maxPromptCharacters: 2_000,
  },
];

const cadenceOptions = [
  { minutes: 1_440, label: "Daily" },
  { minutes: 10_080, label: "Weekly" },
];

export function PromptsPage({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(
    () =>
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(`aeokit:prompt-onboarding:${project.id}`) === "1",
  );
  const search = readQueryText(searchParams, "search");
  const [queuedPromptIds, setQueuedPromptIds] = useState<Set<string>>(
    () => new Set(),
  );
  const promptsQuery = useQuery({
    queryKey: tenantQueryKey("prompts", project.id),
    queryFn: () =>
      api<{ prompts: Prompt[] }>(`/projects/${project.id}/prompts`),
    refetchInterval: 5_000,
  });
  const providersQuery = useQuery({
    queryKey: tenantQueryKey("providers"),
    queryFn: () => api<{ providers: ProviderStatus[] }>("/providers"),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: tenantQueryKey("prompts", project.id),
    });

  const toggleMutation = useMutation({
    mutationFn: ({
      promptId,
      enabled,
    }: {
      promptId: string;
      enabled: boolean;
    }) =>
      api(`/prompts/${promptId}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: invalidate,
  });
  const cadenceMutation = useMutation({
    mutationFn: ({
      promptId,
      cadenceMinutes,
    }: {
      promptId: string;
      cadenceMinutes: number;
    }) =>
      api(`/prompts/${promptId}`, {
        method: "PATCH",
        body: JSON.stringify({ cadenceMinutes }),
      }),
    onSuccess: invalidate,
  });
  const runMutation = useMutation({
    mutationFn: (promptId: string) =>
      api(`/prompts/${promptId}/run`, { method: "POST" }),
    onMutate: (promptId) => {
      setQueuedPromptIds((current) => new Set(current).add(promptId));
    },
    onError: (_error, promptId) => {
      setQueuedPromptIds((current) => {
        const next = new Set(current);
        next.delete(promptId);
        return next;
      });
    },
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (promptId: string) =>
      api(`/prompts/${promptId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const filtered = useMemo(() => {
    const rows = promptsQuery.data?.prompts ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((prompt) =>
      [prompt.value, ...prompt.tags].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [promptsQuery.data, search]);

  useEffect(() => {
    if (!promptsQuery.data) return;
    const activeIds = new Set(
      promptsQuery.data.prompts
        .filter((prompt) => prompt.hasActiveRun)
        .map((prompt) => prompt.id),
    );
    setQueuedPromptIds((current) => {
      const next = new Set(
        [...current].filter((promptId) => activeIds.has(promptId)),
      );
      if (
        next.size === current.size &&
        [...next].every((promptId) => current.has(promptId))
      ) {
        return current;
      }
      return next;
    });
  }, [promptsQuery.data]);

  return (
    <div className="page-shell">
      <PageHeader
        title="Prompts"
        description="Questions aeokit asks answer engines on a schedule. Each response remains available for audit."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setSuggestionsOpen(true)}
            >
              Generate suggested prompts
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setModalOpen(true)}
            >
              <Plus className="size-4" /> Add prompt
            </button>
          </div>
        }
      />
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="input input-sm flex w-full max-w-sm items-center gap-2 border-base-300">
          <Search className="size-4 text-base-content/40" />
          <input
            value={search}
            onChange={(event) =>
              setSearchParams(
                updateQueryParam(searchParams, "search", event.target.value),
              )
            }
            placeholder="Search prompts"
            className="grow"
          />
        </label>
        <div className="text-xs text-base-content/45">
          {promptsQuery.isSuccess
            ? `${filtered.length} prompt${filtered.length === 1 ? "" : "s"}`
            : `${unknownValue} prompts`}
        </div>
      </div>
      {promptsQuery.isError ? (
        <ErrorState
          message={`Prompts could not be loaded. ${(promptsQuery.error as Error).message}`}
          onRetry={() => void promptsQuery.refetch()}
          retrying={promptsQuery.isFetching}
        />
      ) : null}
      {promptsQuery.isPending ? (
        <LoadingBlock className="h-72" />
      ) : promptsQuery.isError ? null : (
        <section className="data-panel">
          {filtered.length ? (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-full">Prompt</th>
                    <th>Surfaces</th>
                    <th>Cadence</th>
                    <th>Last run</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((prompt) => {
                    const queued =
                      prompt.hasActiveRun || queuedPromptIds.has(prompt.id);
                    return (
                      <tr
                        key={prompt.id}
                        className={`hover:bg-base-200/35 ${prompt.enabled ? "" : "opacity-55"}`}
                      >
                        <td>
                          <Link
                            to={`../runs?promptId=${prompt.id}`}
                            className="block max-w-2xl font-medium leading-5 hover:text-primary hover:underline"
                            title="View prompt run history"
                          >
                            {prompt.value}
                          </Link>
                          {prompt.tags.length ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {prompt.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="badge badge-ghost badge-sm"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {prompt.targets.length ? (
                              prompt.targets.map((target) => (
                                <ProviderBadge
                                  key={target.id}
                                  provider={target.provider}
                                  model={target.model}
                                />
                              ))
                            ) : (
                              <span className="text-xs text-base-content/40">
                                Configured surfaces
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          <select
                            className="select select-sm w-36 border-base-300"
                            value={prompt.cadenceMinutes}
                            aria-label={`Cadence for ${prompt.value}`}
                            title="Change cadence"
                            disabled={
                              cadenceMutation.isPending &&
                              cadenceMutation.variables?.promptId === prompt.id
                            }
                            onChange={(event) =>
                              cadenceMutation.mutate({
                                promptId: prompt.id,
                                cadenceMinutes: Number(event.target.value),
                              })
                            }
                          >
                            {!cadenceOptions.some(
                              (option) =>
                                option.minutes === prompt.cadenceMinutes,
                            ) ? (
                              <option value={prompt.cadenceMinutes}>
                                Every {formatCadence(prompt.cadenceMinutes)}
                              </option>
                            ) : null}
                            {cadenceOptions.map((option) => (
                              <option
                                key={option.minutes}
                                value={option.minutes}
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="whitespace-nowrap text-base-content/55">
                          {formatRelative(prompt.lastRunAt)}
                        </td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-square"
                              title={prompt.enabled ? "Pause" : "Enable"}
                              aria-label={`${prompt.enabled ? "Pause" : "Enable"} ${prompt.value}`}
                              onClick={() =>
                                toggleMutation.mutate({
                                  promptId: prompt.id,
                                  enabled: !prompt.enabled,
                                })
                              }
                            >
                              {prompt.enabled ? (
                                <Pause className="size-4" />
                              ) : (
                                <Play className="size-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              className={`btn btn-ghost btn-sm ${queued ? "px-2" : "btn-square"}`}
                              title={queued ? "Queued" : "Run now"}
                              aria-label={
                                queued
                                  ? `${prompt.value} is queued`
                                  : `Run ${prompt.value} now`
                              }
                              disabled={queued || !prompt.enabled}
                              onClick={() => runMutation.mutate(prompt.id)}
                            >
                              <RefreshCw
                                className={`size-4 ${queued ? "animate-spin" : ""}`}
                              />
                              {queued ? <span>Queued</span> : null}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-square text-error"
                              title="Delete prompt"
                              aria-label={`Delete ${prompt.value}`}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Delete this prompt and all of its runs?",
                                  )
                                )
                                  deleteMutation.mutate(prompt.id);
                              }}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <FilteredEmptyState
              hasItems={Boolean(promptsQuery.data?.prompts.length)}
              hasActiveFilters={Boolean(search.trim())}
              emptyTitle="No prompts yet"
              emptyDescription="Add your first prompt to start tracking AI visibility."
              filteredTitle="No matching prompts"
              filteredDescription="No prompts match your search."
              clearLabel="Clear search"
              onClear={() =>
                setSearchParams(updateQueryParam(searchParams, "search", ""))
              }
              emptyAction={
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setModalOpen(true)}
                >
                  Add prompt
                </button>
              }
            />
          )}
        </section>
      )}
      <AddPromptModal
        open={modalOpen}
        project={project}
        providers={(providersQuery.data?.providers ?? []).filter(
          (provider) => provider.id === "brightdata",
        )}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          invalidate();
        }}
      />
      <SuggestedPromptsModal
        open={suggestionsOpen}
        project={project}
        provider={providersQuery.data?.providers.find(
          (item) => item.id === "brightdata",
        )}
        onClose={() => {
          sessionStorage.removeItem(`aeokit:prompt-onboarding:${project.id}`);
          setSuggestionsOpen(false);
        }}
        onCreated={() => {
          sessionStorage.removeItem(`aeokit:prompt-onboarding:${project.id}`);
          setSuggestionsOpen(false);
          invalidate();
        }}
      />
    </div>
  );
}

function SuggestedPromptsModal({
  open,
  project,
  provider,
  onClose,
  onCreated,
}: {
  open: boolean;
  project: Project;
  provider: ProviderStatus | undefined;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [category, setCategory] = useState("");
  const [audience, setAudience] = useState("");
  const [geography, setGeography] = useState("");
  const [language, setLanguage] = useState("English");
  const [additionalContext, setAdditionalContext] = useState("");
  const [count, setCount] = useState(12);
  const [result, setResult] = useState<PromptSuggestionResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const generate = useMutation({
    mutationFn: () =>
      api<PromptSuggestionResponse>(
        `/projects/${project.id}/prompt-suggestions`,
        {
          method: "POST",
          body: JSON.stringify({
            category,
            audiences: audience ? [audience] : [],
            geography,
            language,
            additionalContext,
            count,
          }),
        },
      ),
    onSuccess: (data) => {
      setResult(data);
      setCategory(data.derivedContext.category || category);
      setSelected(new Set(data.suggestions.map((_, index) => index)));
    },
  });
  const surfaceOptions = provider?.modelOptions.length
    ? provider.modelOptions
    : brightDataFallbackOptions;
  const approve = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}/prompt-suggestions/approve`, {
        method: "POST",
        body: JSON.stringify({
          suggestions:
            result?.suggestions.filter((_, index) => selected.has(index)) ?? [],
          metadata: result?.metadata ?? {},
          cadenceMinutes: 1_440,
          targets: surfaceOptions.map((option) => ({
            provider: "brightdata",
            model: option.id,
            webSearch: true,
          })),
        }),
      }),
    onSuccess: onCreated,
  });
  const updateSuggestion = (index: number, update: Partial<PromptSuggestion>) =>
    setResult((current) =>
      current
        ? {
            ...current,
            suggestions: current.suggestions.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...update } : item,
            ),
          }
        : current,
    );
  const removeSuggestion = (index: number) => {
    setResult((current) =>
      current
        ? {
            ...current,
            suggestions: current.suggestions.filter(
              (_, itemIndex) => itemIndex !== index,
            ),
          }
        : current,
    );
    setSelected(
      (current) =>
        new Set(
          [...current]
            .filter((selectedIndex) => selectedIndex !== index)
            .map((selectedIndex) =>
              selectedIndex > index ? selectedIndex - 1 : selectedIndex,
            ),
        ),
    );
  };
  const selectedCount = [...selected].filter(
    (index) => result?.suggestions[index],
  ).length;
  return (
    <Modal
      open={open}
      title="Suggested prompt set"
      description="Generate, review, and approve buyer questions. Saving never starts monitoring runs."
      onClose={onClose}
    >
      <div className="max-h-[80vh] space-y-4 overflow-y-auto p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="fieldset">
            <span className="fieldset-legend">Product category</span>
            <input
              className="input w-full"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Project management software"
            />
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Target audience</span>
            <input
              className="input w-full"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Software agencies"
            />
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Geography</span>
            <input
              className="input w-full"
              value={geography}
              onChange={(e) => setGeography(e.target.value)}
              placeholder="United States"
            />
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Language</span>
            <input
              className="input w-full"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Prompt count</span>
            <input
              type="number"
              min={5}
              max={30}
              className="input w-full"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Additional context</span>
            <input
              className="input w-full"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
            />
          </label>
        </div>
        <button
          className="btn btn-primary"
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
        >
          {generate.isPending
            ? "Generating…"
            : result
              ? "Regenerate suggestions"
              : "Generate suggested prompts"}
        </button>
        {generate.isError ? (
          <ErrorState message={(generate.error as Error).message} />
        ) : null}
        {result ? (
          <>
            {result.warning ? (
              <div className="alert alert-warning text-sm">
                AI generation was unavailable. These deterministic templates can
                be used now, or retry generation.
              </div>
            ) : null}
            <div className="rounded-lg bg-base-200 p-3 text-sm">
              <strong>{selectedCount}</strong> selected prompts ·{" "}
              <strong>{selectedCount * surfaceOptions.length}</strong> provider
              runs per cycle · generation cost{" "}
              <strong>${(result.costUsd ?? 0).toFixed(4)}</strong> · estimated
              monitoring cost: <strong>unavailable</strong> because the selected
              provider does not expose a pre-run price. Monitoring charges begin
              only when you run or schedule saved prompts.
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-xs"
                onClick={() =>
                  setSelected(
                    new Set(result.suggestions.map((_, index) => index)),
                  )
                }
              >
                Select all
              </button>
              <button
                className="btn btn-xs"
                onClick={() => setSelected(new Set())}
              >
                Select none
              </button>
            </div>
            <div className="space-y-2">
              {result.suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 rounded-lg border border-base-300 p-3"
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm mt-2"
                    checked={selected.has(index)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        next.has(index) ? next.delete(index) : next.add(index);
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 grow">
                    <textarea
                      className="textarea textarea-sm w-full"
                      value={suggestion.value}
                      onChange={(e) =>
                        updateSuggestion(index, { value: e.target.value })
                      }
                    />
                    <div className="mt-1 flex gap-2">
                      <span className="badge badge-sm">
                        {suggestion.intent.replaceAll("_", " ")}
                      </span>
                      <span className="badge badge-sm badge-ghost">
                        {suggestion.branded ? "branded" : "generic"}
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-xs"
                    aria-label="Remove suggestion"
                    onClick={() => removeSuggestion(index)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            {approve.isError ? (
              <ErrorState message={(approve.error as Error).message} />
            ) : null}
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!selectedCount || approve.isPending}
                onClick={() => approve.mutate()}
              >
                {approve.isPending
                  ? "Saving…"
                  : `Approve and save ${selectedCount}`}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function formatCadence(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1_440) return `${minutes / 60}h`;
  return `${minutes / 1_440}d`;
}

export function AddPromptModal({
  open,
  project,
  providers,
  onClose,
  onCreated,
}: {
  open: boolean;
  project: Project;
  providers: ProviderStatus[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const brightDataProvider = providers.find(
    (provider) => provider.id === "brightdata",
  );
  const [value, setValue] = useState("");
  const [tags, setTags] = useState("");
  const [cadenceMinutes, setCadenceMinutes] = useState(1_440);
  const [model, setModel] = useState("");
  useEffect(() => {
    if (!open) return;
    setModel(brightDataProvider?.defaultModel ?? "chatgpt");
  }, [open, brightDataProvider?.defaultModel]);
  const surfaceOptions = brightDataProvider?.modelOptions.length
    ? brightDataProvider.modelOptions
    : brightDataFallbackOptions;
  const selectedModelOption = surfaceOptions.find(
    (option) => option.id === model,
  );
  const maximumPromptLength =
    model === "brightdata-all"
      ? Math.min(
          ...surfaceOptions.map(
            (option) => option.maxPromptCharacters ?? 2_000,
          ),
        )
      : (selectedModelOption?.maxPromptCharacters ?? 2_000);
  const mutation = useMutation({
    mutationFn: () => {
      return api(`/projects/${project.id}/prompts`, {
        method: "POST",
        body: JSON.stringify({
          value,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          enabled: true,
          cadenceMinutes,
          targets:
            model === "brightdata-all"
              ? surfaceOptions.map((option) => ({
                  provider: "brightdata" as const,
                  model: option.id,
                  webSearch: true,
                }))
              : [
                  {
                    provider: "brightdata" as const,
                    model:
                      model || brightDataProvider?.defaultModel || "chatgpt",
                    webSearch: true,
                  },
                ],
        }),
      });
    },
    onSuccess: () => {
      setValue("");
      setTags("");
      setModel("");
      onCreated();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim().length >= 5) mutation.mutate();
  };

  return (
    <Modal
      open={open}
      title="Add prompt"
      description="Track one buyer question across user-facing AI surfaces."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <fieldset className="fieldset">
          <label className="fieldset-legend" htmlFor="add-prompt-value">
            Prompt
          </label>
          <textarea
            id="add-prompt-value"
            className="textarea min-h-28 w-full border-base-300"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="What are the best open-source AEO platforms?"
            required
            minLength={5}
            maxLength={maximumPromptLength}
          />
          <p className="fieldset-label">
            AI visibility prompt · {maximumPromptLength} character maximum
          </p>
        </fieldset>
        <fieldset className="fieldset">
          <label className="fieldset-legend" htmlFor="add-prompt-tags">
            Tags
          </label>
          <input
            id="add-prompt-tags"
            className="input w-full border-base-300"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="discovery, comparison"
          />
          <p className="fieldset-label">Comma-separated</p>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="fieldset">
            <label className="fieldset-legend" htmlFor="add-prompt-surface">
              AI surface
            </label>
            <select
              id="add-prompt-surface"
              className="select w-full border-base-300"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              <option value="brightdata-all">
                All tracked surfaces — 6 separate runs
              </option>
              {surfaceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset className="fieldset">
            <label className="fieldset-legend" htmlFor="add-prompt-cadence">
              Cadence
            </label>
            <select
              id="add-prompt-cadence"
              className="select w-full border-base-300"
              value={cadenceMinutes}
              onChange={(event) =>
                setCadenceMinutes(Number(event.target.value))
              }
            >
              {cadenceOptions.map((option) => (
                <option key={option.minutes} value={option.minutes}>
                  {option.label}
                </option>
              ))}
            </select>
          </fieldset>
        </div>
        <p className="text-xs text-base-content/55">
          Bright Data captures ChatGPT, Perplexity, Gemini, Google AI Mode,
          Google AI Overview, and Bing Copilot. “All tracked surfaces” runs each
          one separately.
          {brightDataProvider && !brightDataProvider.configured
            ? " Bright Data credentials are not configured yet."
            : ""}
        </p>
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
            disabled={
              mutation.isPending ||
              value.trim().length < 5 ||
              value.length > maximumPromptLength
            }
          >
            {mutation.isPending ? "Adding…" : "Add prompt"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

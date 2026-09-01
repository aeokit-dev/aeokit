import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Check,
  CircleAlert,
  KeyRound,
  Monitor,
  Moon,
  Server,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { api, tenantQueryKey } from "../api";
import type { Project, ProviderHealthResponse } from "../types";
import {
  ErrorState,
  LoadingBlock,
  PageHeader,
  formatRelative,
} from "../components/ui";
import { IntegrationsPanel } from "../components/IntegrationsPanel";
import { ApiKeysPanel } from "../components/ApiKeysPanel";
import { Modal } from "../components/Modal";
import { type ThemePreference, useThemePreference } from "../theme";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function SettingsPage({
  project,
  hosted = false,
}: {
  project: Project;
  hosted?: boolean;
}) {
  const queryClient = useQueryClient();
  const { themePreference, setThemePreference } = useThemePreference();
  const [name, setName] = useState(project.name);
  const [website, setWebsite] = useState(project.website);
  const [aliases, setAliases] = useState(project.aliases.join(", "));
  const [domains, setDomains] = useState(project.additionalDomains.join(", "));
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState(project.category ?? "");
  const [reportSlug, setReportSlug] = useState(
    project.reportSlug ??
      `${project.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}-ai-visibility`,
  );
  const [reportStaleAfterDays, setReportStaleAfterDays] = useState(
    project.reportStaleAfterDays ?? 30,
  );
  const [reportSections, setReportSections] = useState(
    project.reportSections ?? {
      prompts: false,
      answers: false,
      competitors: true,
      citations: true,
      costs: false,
    },
  );
  useEffect(() => {
    setName(project.name);
    setWebsite(project.website);
    setAliases(project.aliases.join(", "));
    setDomains(project.additionalDomains.join(", "));
  }, [project]);
  const providersQuery = useQuery({
    queryKey: tenantQueryKey("providers", project.id),
    queryFn: () =>
      api<ProviderHealthResponse>(
        `/providers?projectId=${encodeURIComponent(project.id)}`,
      ),
    refetchInterval: 15_000,
  });
  const mutation = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          website,
          aliases: aliases
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          additionalDomains: domains
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tenantQueryKey("projects") }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  const archiveMutation = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}/archive`, {
        method: "POST",
      }),
    onSuccess: async () => {
      setArchiveConfirmOpen(false);
      await queryClient.invalidateQueries({
        queryKey: tenantQueryKey("projects"),
      });
    },
  });
  const reportMutation = useMutation({
    mutationFn: (published: boolean) =>
      api<{ publicPath: string }>(`/projects/${project.id}/public-report`, {
        method: "PUT",
        body: JSON.stringify({
          category: reportCategory,
          slug: reportSlug,
          staleAfterDays: reportStaleAfterDays,
          published,
          sections: reportSections,
        }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tenantQueryKey("projects") }),
  });
  const previewReport = async () => {
    const preview = window.open("", "aeokit-report-preview");
    if (!preview) return;
    preview.document.write("<p>Loading report preview…</p>");
    try {
      await api(`/projects/${project.id}/public-report`, {
        method: "PUT",
        body: JSON.stringify({
          category: reportCategory || "Uncategorized",
          slug: reportSlug,
          staleAfterDays: reportStaleAfterDays,
          published: Boolean(project.reportPublishedAt),
          sections: reportSections,
        }),
      });
      const result = await api<{ html: string }>(
        `/projects/${project.id}/public-report/preview`,
      );
      preview.document.open();
      preview.document.write(result.html);
      preview.document.close();
    } catch (error) {
      preview.document.body.textContent =
        error instanceof Error ? error.message : "Preview failed";
    }
  };
  const publicReportUrl =
    project.reportPublishedAt && project.category && project.reportSlug
      ? `${window.location.origin}/reports/${project.category.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}/${project.reportSlug}`
      : null;
  const copyPublicReport = () =>
    publicReportUrl
      ? navigator.clipboard.writeText(publicReportUrl)
      : Promise.resolve();
  const sharePublicReport = () =>
    publicReportUrl && navigator.share
      ? navigator.share({
          title: `${project.name} AI visibility report`,
          url: publicReportUrl,
        })
      : copyPublicReport();
  return (
    <div className="page-shell">
      <PageHeader
        title="Settings"
        description="Brand matching, analytics integrations, and provider health."
      />
      <section className="data-panel mb-4 p-5">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h2 className="text-base font-semibold leading-tight">
              Appearance
            </h2>
            <p className="mt-0.5 text-xs text-base-content/45">Theme</p>
          </div>
          <div
            role="radiogroup"
            aria-label="Theme preference"
            className="flex gap-0.5 rounded-lg bg-base-200 p-0.5"
          >
            {themeOptions.map((option) => {
              const active = option.value === themePreference;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={option.label}
                  title={option.label}
                  className={`flex cursor-pointer items-center justify-center rounded-md px-3 py-1.5 transition-colors ${
                    active
                      ? "bg-base-100 text-base-content shadow-sm"
                      : "text-base-content/50 hover:text-base-content/80"
                  }`}
                  onClick={() => setThemePreference(option.value)}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        </div>
      </section>
      {hosted ? <ApiKeysPanel /> : null}
      {hosted ? (
        <div className="mb-4">
          <IntegrationsPanel project={project} />
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="data-panel p-5">
          <h2 className="text-base font-semibold">
            Public AI visibility report
          </h2>
          <p className="mt-1 text-xs text-base-content/45">
            Private by default. Choose exactly which evidence can be shared
            before publishing.
          </p>
          <fieldset className="fieldset mt-3">
            <label
              className="fieldset-legend"
              htmlFor="settings-report-category"
            >
              Category
            </label>
            <input
              id="settings-report-category"
              className="input w-full border-base-300"
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
              placeholder="CRM software"
            />
          </fieldset>
          <fieldset className="fieldset">
            <label
              className="fieldset-legend"
              htmlFor="settings-report-stale-after"
            >
              Stale warning after
            </label>
            <select
              id="settings-report-stale-after"
              className="select w-full border-base-300"
              value={reportStaleAfterDays}
              onChange={(event) =>
                setReportStaleAfterDays(Number(event.target.value))
              }
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </fieldset>
          <fieldset className="fieldset">
            <label className="fieldset-legend" htmlFor="settings-report-slug">
              Report URL slug
            </label>
            <input
              id="settings-report-slug"
              className="input w-full border-base-300 font-mono"
              value={reportSlug}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              onChange={(event) =>
                setReportSlug(
                  event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
                )
              }
            />
          </fieldset>
          <div className="my-3 grid grid-cols-2 gap-2">
            {(
              [
                "prompts",
                "answers",
                "competitors",
                "citations",
                "costs",
              ] as const
            ).map((key) => (
              <label className="label justify-start gap-2" key={key}>
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={reportSections[key]}
                  onChange={(e) =>
                    setReportSections({
                      ...reportSections,
                      [key]: e.target.checked,
                    })
                  }
                />
                <span className="capitalize">{key}</span>
              </label>
            ))}
          </div>
          <button
            className="link text-sm"
            type="button"
            onClick={previewReport}
          >
            Preview private report
          </button>
          {publicReportUrl ? (
            <div className="mt-2 flex gap-3">
              <button
                className="link text-sm"
                type="button"
                onClick={copyPublicReport}
              >
                Copy public link
              </button>
              <button
                className="link text-sm"
                type="button"
                onClick={sharePublicReport}
              >
                Share report
              </button>
            </div>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="btn btn-ghost btn-sm"
              disabled={!project.reportPublishedAt || reportMutation.isPending}
              onClick={() => reportMutation.mutate(false)}
            >
              Unpublish
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={!reportCategory.trim() || reportMutation.isPending}
              onClick={() => reportMutation.mutate(true)}
            >
              {project.reportPublishedAt ? "Update report" : "Publish report"}
            </button>
          </div>
        </section>
        <section className="data-panel p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold leading-tight">
              Brand profile
            </h2>
            <p className="mt-0.5 text-xs text-base-content/45">
              Used for mention detection and owned citation classification.
            </p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <fieldset className="fieldset">
              <label className="fieldset-legend" htmlFor="settings-brand-name">
                Brand name
              </label>
              <input
                id="settings-brand-name"
                className="input w-full border-base-300"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </fieldset>
            <fieldset className="fieldset">
              <label className="fieldset-legend" htmlFor="settings-website">
                Website
              </label>
              <input
                id="settings-website"
                className="input w-full border-base-300"
                type="url"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                required
              />
            </fieldset>
            <fieldset className="fieldset">
              <label className="fieldset-legend" htmlFor="settings-aliases">
                Aliases
              </label>
              <input
                id="settings-aliases"
                className="input w-full border-base-300"
                value={aliases}
                onChange={(event) => setAliases(event.target.value)}
              />
              <p className="fieldset-label">
                Comma-separated names that should count as a mention
              </p>
            </fieldset>
            <fieldset className="fieldset">
              <label
                className="fieldset-legend"
                htmlFor="settings-additional-domains"
              >
                Additional owned domains
              </label>
              <input
                id="settings-additional-domains"
                className="input w-full border-base-300 font-mono text-sm"
                value={domains}
                onChange={(event) => setDomains(event.target.value)}
              />
              <p className="fieldset-label">Comma-separated</p>
            </fieldset>
            {mutation.isError ? (
              <ErrorState message={(mutation.error as Error).message} />
            ) : null}
            <div className="flex items-center justify-end gap-3">
              <span
                className={`text-xs text-success transition-opacity ${mutation.isSuccess ? "opacity-100" : "opacity-0"}`}
              >
                <Check className="mr-1 inline size-3.5" />
                Saved
              </span>
              <button
                className="btn btn-primary btn-sm"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </section>
        <section className="data-panel">
          <div className="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold leading-tight">
                Data providers
              </h2>
              <p className="mt-0.5 text-xs text-base-content/45">
                Credentials, worker availability, and recent provider results.
              </p>
            </div>
            {providersQuery.data ? (
              <div className="text-right">
                <span
                  className={`badge badge-sm ${providersQuery.data.worker.status === "ready" ? "badge-success" : "badge-error"}`}
                >
                  <Server className="size-3" />
                  Worker {providersQuery.data.worker.status}
                </span>
                <p className="mt-1 text-xs text-base-content/40">
                  Seen {formatRelative(providersQuery.data.worker.lastSeenAt)}
                </p>
              </div>
            ) : null}
          </div>
          {providersQuery.isPending ? (
            <div className="p-5">
              <LoadingBlock className="h-48" />
            </div>
          ) : providersQuery.isError ? (
            <div className="p-5">
              <ErrorState message={(providersQuery.error as Error).message} />
            </div>
          ) : (
            <div className="divide-y divide-base-300">
              {providersQuery.data?.providers.map((provider) => {
                const ready = provider.status === "ready";
                const statusLabel =
                  provider.status === "missing_credentials"
                    ? "Credentials missing"
                    : provider.status === "worker_offline"
                      ? "Worker offline"
                      : provider.status === "failing"
                        ? "Needs attention"
                        : "Ready";
                return (
                  <div key={provider.id} className="flex gap-3 px-5 py-4">
                    <span
                      className={`h-fit rounded-lg p-2 ${ready ? "bg-success/15 text-success" : provider.status === "missing_credentials" ? "bg-warning/20 text-base-content/60" : "bg-error/15 text-error"}`}
                    >
                      {ready ? (
                        <Check className="size-4" />
                      ) : provider.status === "missing_credentials" ? (
                        <KeyRound className="size-4" />
                      ) : (
                        <TriangleAlert className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{provider.label}</p>
                        <span
                          className={`badge badge-sm ${ready ? "badge-success" : provider.status === "missing_credentials" ? "badge-ghost" : "badge-error"}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <p className="truncate text-xs text-base-content/40">
                        {provider.modelOptions.length
                          ? `${provider.modelOptions.length} surfaces: ${provider.modelOptions.map((option) => option.label).join(", ")}`
                          : provider.defaultModel}
                      </p>
                      <div className="mt-2 grid gap-1 text-xs text-base-content/50 sm:grid-cols-2">
                        <p>
                          Last success:{" "}
                          {formatRelative(provider.lastSuccessfulRunAt)}
                        </p>
                        <p
                          title={provider.lastError ?? undefined}
                          className="truncate"
                        >
                          Last error:{" "}
                          {provider.lastError
                            ? `${formatRelative(provider.lastErrorAt)} · ${provider.lastError}`
                            : "None"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!hosted ? (
            <div className="m-5 rounded-lg border border-base-300 bg-base-200/50 p-4">
              <div className="flex gap-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-base-content/45" />
                <div className="text-xs leading-5 text-base-content/55">
                  Add keys to your{" "}
                  <code className="rounded bg-base-300/60 px-1 py-0.5 font-mono">
                    .env
                  </code>{" "}
                  file, then restart the API and worker. Supported variables are
                  documented in{" "}
                  <code className="rounded bg-base-300/60 px-1 py-0.5 font-mono">
                    .env.example
                  </code>
                  .
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
      <section className="data-panel mt-4 border-warning/30 p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold leading-tight">
              Archive brand
            </h2>
            <p className="mt-1 text-sm text-base-content/55">
              Hide this brand from active tracking while keeping its history.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-warning btn-outline btn-sm"
            onClick={() => setArchiveConfirmOpen(true)}
          >
            <Archive className="size-4" />
            Archive brand
          </button>
        </div>
      </section>
      {archiveConfirmOpen ? (
        <Modal
          open
          title={`Archive ${project.name}?`}
          description="The brand will leave active tracking, but all prompts, runs, citations, and settings will be preserved."
          onClose={() => setArchiveConfirmOpen(false)}
        >
          <div className="p-5">
            {archiveMutation.isError ? (
              <div className="mb-4">
                <ErrorState
                  message={(archiveMutation.error as Error).message}
                />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setArchiveConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-warning"
                disabled={archiveMutation.isPending}
                onClick={() => archiveMutation.mutate()}
              >
                <Archive className="size-4" />
                {archiveMutation.isPending ? "Archiving…" : "Archive brand"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

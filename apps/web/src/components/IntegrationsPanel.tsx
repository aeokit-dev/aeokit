import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Cloud,
  ExternalLink,
  KeyRound,
  MousePointerClick,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { api, tenantQueryKey } from "../api";
import type {
  IntegrationStatus,
  Project,
  ProjectIntegrationsResponse,
} from "../types";
import { ErrorState, LoadingBlock, formatRelative } from "./ui";

type IntegrationProvider = "posthog" | "cloudflare";

function successEventsFromText(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((event) => event.trim())
        .filter(Boolean),
    ),
  ];
}

function ConnectionBadge({ status }: { status: IntegrationStatus }) {
  if (status.error) {
    return (
      <span className="badge badge-error badge-sm">Reconnect required</span>
    );
  }
  if (status.configured) {
    return (
      <span className="badge badge-success badge-sm">
        <Check className="size-3" /> Connected
      </span>
    );
  }
  return <span className="badge badge-ghost badge-sm">Not connected</span>;
}

function ManualPostHogForm({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: () => void;
}) {
  const [host, setHost] = useState("https://us.posthog.com");
  const [postHogProjectId, setPostHogProjectId] = useState("");
  const [personalApiKey, setPersonalApiKey] = useState("");
  const [successEvents, setSuccessEvents] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}/integrations/posthog`, {
        method: "PUT",
        body: JSON.stringify({
          host,
          postHogProjectId,
          personalApiKey,
          successEvents: successEventsFromText(successEvents),
        }),
      }),
    onSuccess: () => {
      setPersonalApiKey("");
      onSaved();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="fieldset">
          <label
            className="fieldset-legend"
            htmlFor="integration-posthog-region"
          >
            PostHog region
          </label>
          <select
            id="integration-posthog-region"
            className="select w-full border-base-300"
            value={host}
            onChange={(event) => setHost(event.target.value)}
          >
            <option value="https://us.posthog.com">US Cloud</option>
            <option value="https://eu.posthog.com">EU Cloud</option>
          </select>
        </fieldset>
        <fieldset className="fieldset">
          <label
            className="fieldset-legend"
            htmlFor="integration-posthog-project-id"
          >
            Project ID
          </label>
          <input
            id="integration-posthog-project-id"
            className="input w-full border-base-300"
            inputMode="numeric"
            value={postHogProjectId}
            onChange={(event) => setPostHogProjectId(event.target.value)}
            required
          />
        </fieldset>
      </div>
      <fieldset className="fieldset">
        <label
          className="fieldset-legend"
          htmlFor="integration-posthog-api-key"
        >
          Personal API key
        </label>
        <input
          id="integration-posthog-api-key"
          className="input w-full border-base-300 font-mono"
          type="password"
          autoComplete="off"
          value={personalApiKey}
          onChange={(event) => setPersonalApiKey(event.target.value)}
          required
        />
        <p className="fieldset-label">Requires Query Read access.</p>
      </fieldset>
      <fieldset className="fieldset">
        <label
          className="fieldset-legend"
          htmlFor="integration-posthog-success-events"
        >
          Success events (optional)
        </label>
        <textarea
          id="integration-posthog-success-events"
          className="textarea w-full border-base-300 font-mono"
          value={successEvents}
          onChange={(event) => setSuccessEvents(event.target.value)}
          placeholder={"demo requested\naccount created\npurchase"}
          rows={3}
        />
        <p className="fieldset-label">
          One exact PostHog event name per line, up to 10.
        </p>
      </fieldset>
      {mutation.isError ? (
        <ErrorState message={(mutation.error as Error).message} />
      ) : null}
      <button
        className="btn btn-sm"
        disabled={mutation.isPending || !personalApiKey || !postHogProjectId}
      >
        {mutation.isPending ? "Saving…" : "Save PostHog key"}
      </button>
    </form>
  );
}

function ManualCloudflareForm({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: () => void;
}) {
  const [apiToken, setApiToken] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}/integrations/cloudflare`, {
        method: "PUT",
        body: JSON.stringify({ apiToken }),
      }),
    onSuccess: () => {
      setApiToken("");
      onSaved();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <fieldset className="fieldset">
        <label
          className="fieldset-legend"
          htmlFor="integration-cloudflare-api-token"
        >
          Cloudflare API token
        </label>
        <input
          id="integration-cloudflare-api-token"
          className="input w-full border-base-300 font-mono"
          type="password"
          autoComplete="off"
          value={apiToken}
          onChange={(event) => setApiToken(event.target.value)}
          required
        />
        <p className="fieldset-label">
          Requires Zone Read, Zone Analytics Read, and Account Analytics Read.
        </p>
      </fieldset>
      {mutation.isError ? (
        <ErrorState message={(mutation.error as Error).message} />
      ) : null}
      <button className="btn btn-sm" disabled={mutation.isPending || !apiToken}>
        {mutation.isPending ? "Saving…" : "Save Cloudflare token"}
      </button>
    </form>
  );
}

export function IntegrationsPanel({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const queryKey = tenantQueryKey("integrations", project.id);
  const query = useQuery({
    queryKey,
    queryFn: () =>
      api<ProjectIntegrationsResponse>(`/projects/${project.id}/integrations`),
  });
  const [successEvents, setSuccessEvents] = useState("");

  useEffect(() => {
    setSuccessEvents(query.data?.posthog.successEvents.join("\n") ?? "");
  }, [query.data?.posthog.successEvents]);

  const refreshData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey("ai-referrals", project.id),
      }),
      queryClient.invalidateQueries({
        queryKey: tenantQueryKey("crawler-traffic", project.id),
      }),
    ]);
  };
  const oauthMutation = useMutation({
    mutationFn: (provider: IntegrationProvider) =>
      api<{ authorizationUrl: string }>(
        `/projects/${project.id}/integrations/${provider}/oauth/start`,
        { method: "POST" },
      ),
    onSuccess: ({ authorizationUrl }) =>
      window.location.assign(authorizationUrl),
  });
  const disconnectMutation = useMutation({
    mutationFn: (provider: IntegrationProvider) =>
      api(`/projects/${project.id}/integrations/${provider}`, {
        method: "DELETE",
      }),
    onSuccess: refreshData,
  });
  const successEventsMutation = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}/integrations/posthog`, {
        method: "PATCH",
        body: JSON.stringify({
          successEvents: successEventsFromText(successEvents),
        }),
      }),
    onSuccess: refreshData,
  });

  const disconnect = (provider: IntegrationProvider) => {
    if (
      window.confirm(
        `Disconnect ${provider === "posthog" ? "PostHog" : "Cloudflare"} from this project?`,
      )
    ) {
      disconnectMutation.mutate(provider);
    }
  };

  return (
    <section className="data-panel">
      <div className="flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold leading-tight">
            Integrations
          </h2>
          <p className="mt-0.5 text-xs text-base-content/45">
            Connect analytics for {project.name}. Credentials are encrypted and
            scoped to this workspace and project.
          </p>
        </div>
        <span className="badge badge-ghost badge-sm shrink-0">
          <ShieldCheck className="size-3" /> Server-side encryption
        </span>
      </div>

      {query.isPending ? (
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <LoadingBlock className="h-52" />
          <LoadingBlock className="h-52" />
        </div>
      ) : query.isError ? (
        <div className="p-5">
          <ErrorState message={(query.error as Error).message} />
        </div>
      ) : query.data ? (
        <div className="space-y-4 p-5">
          {!query.data.secureStorageAvailable ? (
            <div className="alert alert-warning text-sm">
              <TriangleAlert className="size-4" />
              <span>
                The deployment owner must configure secure integration storage
                before connections can be saved.
              </span>
            </div>
          ) : null}
          {!query.data.canManage ? (
            <div className="alert text-sm">
              <KeyRound className="size-4" />
              <span>
                Only workspace owners and admins can change integrations.
              </span>
            </div>
          ) : null}
          {(oauthMutation.isError || disconnectMutation.isError) && (
            <ErrorState
              message={
                (oauthMutation.error ?? disconnectMutation.error)?.message ??
                "Integration update failed"
              }
            />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary">
                    <MousePointerClick className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">PostHog</h3>
                    <p className="text-xs text-base-content/45">AI outcomes</p>
                  </div>
                </div>
                <ConnectionBadge status={query.data.posthog} />
              </div>
              <p className="mt-4 text-sm text-base-content/55">
                Read aggregate engagement and configured outcomes for sessions
                arriving from known AI assistant domains. OAuth requests
                read-only project and query access.
              </p>
              {query.data.posthog.configured ? (
                <div className="mt-3 rounded-lg bg-base-200/60 p-3 text-xs text-base-content/55">
                  <p>
                    {query.data.posthog.host} · project{" "}
                    {query.data.posthog.postHogProjectId}
                  </p>
                  <p className="mt-1">
                    Connected with {query.data.posthog.authentication} · updated{" "}
                    {formatRelative(query.data.posthog.updatedAt)}
                  </p>
                  {query.data.posthog.error ? (
                    <p className="mt-2 text-error">
                      {query.data.posthog.error}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {query.data.oauth.posthog ? (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={
                      !query.data.canManage ||
                      !query.data.secureStorageAvailable ||
                      oauthMutation.isPending
                    }
                    onClick={() => oauthMutation.mutate("posthog")}
                  >
                    <ExternalLink className="size-3.5" />
                    {query.data.posthog.configured
                      ? "Reconnect"
                      : "Connect PostHog"}
                  </button>
                ) : null}
                {query.data.posthog.configured ? (
                  <button
                    className="btn btn-ghost btn-sm text-error"
                    disabled={
                      !query.data.canManage || disconnectMutation.isPending
                    }
                    onClick={() => disconnect("posthog")}
                  >
                    <Trash2 className="size-3.5" /> Disconnect
                  </button>
                ) : null}
              </div>
              {query.data.posthog.configured ? (
                <div className="mt-4 border-t border-base-300 pt-4">
                  <label className="text-xs font-medium">
                    Success events (optional)
                  </label>
                  <div className="mt-1.5 flex items-end gap-2">
                    <textarea
                      className="textarea textarea-sm min-w-0 flex-1 border-base-300 font-mono"
                      value={successEvents}
                      onChange={(event) => setSuccessEvents(event.target.value)}
                      placeholder={"demo requested\naccount created\npurchase"}
                      rows={3}
                      disabled={!query.data.canManage}
                    />
                    <button
                      className="btn btn-sm"
                      onClick={() => successEventsMutation.mutate()}
                      disabled={
                        !query.data.canManage || successEventsMutation.isPending
                      }
                    >
                      Save
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-base-content/45">
                    One exact PostHog event name per line, up to 10.
                  </p>
                  {successEventsMutation.isError ? (
                    <p className="mt-2 text-xs text-error">
                      {(successEventsMutation.error as Error).message}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {query.data.canManage && query.data.secureStorageAvailable ? (
                <details className="mt-4 border-t border-base-300 pt-3">
                  <summary className="cursor-pointer text-xs text-base-content/50">
                    Enter a personal API key instead
                  </summary>
                  <ManualPostHogForm project={project} onSaved={refreshData} />
                </details>
              ) : null}
            </article>

            <article className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-warning/15 p-2 text-warning">
                    <Cloud className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">Cloudflare</h3>
                    <p className="text-xs text-base-content/45">
                      Crawler traffic
                    </p>
                  </div>
                </div>
                <ConnectionBadge status={query.data.cloudflare} />
              </div>
              <p className="mt-4 text-sm text-base-content/55">
                Read aggregate zone traffic and declared crawler user agents.
                OAuth requests analytics and zone read access only.
              </p>
              {query.data.cloudflare.configured ? (
                <div className="mt-3 rounded-lg bg-base-200/60 p-3 text-xs text-base-content/55">
                  <p>
                    Connected with {query.data.cloudflare.authentication} ·
                    updated {formatRelative(query.data.cloudflare.updatedAt)}
                  </p>
                  {query.data.cloudflare.error ? (
                    <p className="mt-2 text-error">
                      {query.data.cloudflare.error}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {query.data.oauth.cloudflare ? (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={
                      !query.data.canManage ||
                      !query.data.secureStorageAvailable ||
                      oauthMutation.isPending
                    }
                    onClick={() => oauthMutation.mutate("cloudflare")}
                  >
                    <ExternalLink className="size-3.5" />
                    {query.data.cloudflare.configured
                      ? "Reconnect"
                      : "Connect Cloudflare"}
                  </button>
                ) : null}
                {query.data.cloudflare.configured ? (
                  <button
                    className="btn btn-ghost btn-sm text-error"
                    disabled={
                      !query.data.canManage || disconnectMutation.isPending
                    }
                    onClick={() => disconnect("cloudflare")}
                  >
                    <Trash2 className="size-3.5" /> Disconnect
                  </button>
                ) : null}
              </div>
              {query.data.canManage && query.data.secureStorageAvailable ? (
                <details className="mt-4 border-t border-base-300 pt-3">
                  <summary className="cursor-pointer text-xs text-base-content/50">
                    Enter a scoped API token instead
                  </summary>
                  <ManualCloudflareForm
                    project={project}
                    onSaved={refreshData}
                  />
                </details>
              ) : null}
            </article>
          </div>
        </div>
      ) : null}
    </section>
  );
}

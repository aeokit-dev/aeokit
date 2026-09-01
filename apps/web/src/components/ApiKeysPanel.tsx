import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { api, tenantQueryKey } from "../api";

type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type CreatedApiKey = ApiKeySummary & { key: string };

export function ApiKeysPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const queryKey = tenantQueryKey("api-keys");
  const query = useQuery({
    queryKey,
    queryFn: () => api<{ apiKeys: ApiKeySummary[] }>("/api-keys"),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      api<{ apiKey: CreatedApiKey }>("/api-keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: async ({ apiKey }) => {
      setCreated(apiKey);
      setName("");
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) createMutation.mutate();
  };

  return (
    <section className="data-panel mb-4 p-5">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5" />
        <div>
          <h2 className="text-base font-semibold">API keys</h2>
          <p className="mt-1 text-xs text-base-content/50">
            Authenticate CLI, MCP, agents, and integrations with the same
            workspace-scoped bearer key.
          </p>
        </div>
      </div>

      {created ? (
        <div className="alert alert-warning mt-4 block">
          <p className="text-sm font-semibold">Copy this key now</p>
          <p className="mb-2 text-xs">It will not be shown again.</p>
          <div className="flex gap-2">
            <input
              className="input input-sm min-w-0 flex-1 font-mono"
              readOnly
              aria-label="New API key"
              value={created.key}
            />
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => navigator.clipboard.writeText(created.key)}
            >
              <Copy className="size-4" /> Copy
            </button>
          </div>
        </div>
      ) : null}

      <form className="mt-4 flex gap-2" onSubmit={submit}>
        <input
          className="input input-sm min-w-0 flex-1"
          aria-label="API key name"
          maxLength={80}
          placeholder="Claude MCP"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={!name.trim() || createMutation.isPending}
        >
          Create API key
        </button>
      </form>

      {createMutation.isError ? (
        <p className="mt-3 text-sm text-error" role="alert">
          Could not create API key: {createMutation.error.message}
        </p>
      ) : null}

      {query.isPending ? (
        <p className="mt-4 text-sm text-base-content/50">Loading API keys…</p>
      ) : query.isError ? (
        <p className="mt-4 text-sm text-error" role="alert">
          Could not load API keys: {query.error.message}
        </p>
      ) : query.data.apiKeys.length ? (
        <ul className="mt-4 divide-y divide-base-300">
          {query.data.apiKeys.map((key) => (
            <li
              className="flex items-center justify-between gap-4 py-3"
              key={key.id}
            >
              <div>
                <p className="text-sm font-medium">{key.name}</p>
                <code className="text-xs text-base-content/50">
                  {key.prefix}…
                </code>
              </div>
              <button
                className="btn btn-ghost btn-sm text-error"
                type="button"
                aria-label={`Revoke ${key.name}`}
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(key.id)}
              >
                <Trash2 className="size-4" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-base-content/50">
          No API keys yet. Create one above; its secret is shown only once.
        </p>
      )}
    </section>
  );
}

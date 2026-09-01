import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { api, tenantQueryKey } from "../api";
import type { Experiment, ExperimentStatus, Project } from "../types";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  formatDate,
} from "../components/ui";

const statuses: ExperimentStatus[] = [
  "planned",
  "running",
  "evaluating",
  "won",
  "lost",
  "inconclusive",
  "cancelled",
];
const lines = (value: string) =>
  value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
const metricText = (value: Record<string, number>) =>
  JSON.stringify(value, null, 2);
const parseMetrics = (value: string) =>
  value.trim() ? (JSON.parse(value) as Record<string, number>) : {};

export function ExperimentsPage({
  project,
  initialCreateOpen = false,
}: {
  project: Project;
  initialCreateOpen?: boolean;
}) {
  const client = useQueryClient();
  const queryKey = tenantQueryKey("experiments", project.id);
  const query = useQuery({
    queryKey,
    queryFn: () =>
      api<{ experiments: Experiment[] }>(`/projects/${project.id}/experiments`),
  });
  const [open, setOpen] = useState(initialCreateOpen);
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/projects/${project.id}/experiments`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setOpen(false);
      await client.invalidateQueries({ queryKey });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/experiments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      name: data.get("name"),
      hypothesis: data.get("hypothesis"),
      opportunityId: data.get("opportunityId") || null,
      changedUrls: lines(String(data.get("changedUrls") || "")),
      changeRef: data.get("changeRef") || null,
      baselineRunIds: lines(String(data.get("baselineRunIds") || "")),
      baselineMetrics: parseMetrics(String(data.get("baselineMetrics") || "")),
      evaluationDueAt: data.get("evaluationDueAt")
        ? new Date(String(data.get("evaluationDueAt"))).toISOString()
        : null,
    });
  };
  const submitUpdate = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    update.mutate({
      id,
      body: {
        status: data.get("status"),
        changedUrls: lines(String(data.get("changedUrls") || "")),
        changeRef: data.get("changeRef") || null,
        followupRunIds: lines(String(data.get("followupRunIds") || "")),
        resultMetrics: parseMetrics(String(data.get("resultMetrics") || "")),
        evaluationDueAt: data.get("evaluationDueAt")
          ? new Date(String(data.get("evaluationDueAt"))).toISOString()
          : null,
      },
    });
  };
  return (
    <div className="page-shell">
      <PageHeader
        title="Experiments"
        description={`Connect changes for ${project.name} to compatible observations and measurable outcomes.`}
        actions={
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setOpen((value) => !value)}
          >
            <Plus className="size-4" /> Create experiment
          </button>
        }
      />
      {open ? (
        <form
          className="mb-5 rounded-xl border border-base-300 bg-base-100 p-5"
          onSubmit={submitCreate}
        >
          <h2 className="text-lg font-semibold">Create experiment</h2>
          <p className="mt-1 text-sm text-base-content/55">
            Preserve the baseline before changing the site.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" required />
            <Field label="Opportunity ID" name="opportunityId" />
            <Area label="Hypothesis" name="hypothesis" required />
            <Area label="Changed URLs" name="changedUrls" />
            <Field label="Change reference" name="changeRef" />
            <Area label="Baseline run IDs" name="baselineRunIds" />
            <Area
              label="Baseline metrics (JSON)"
              name="baselineMetrics"
              placeholder='{"citationRate":0.2}'
            />
            <Field
              label="Evaluation due"
              name="evaluationDueAt"
              type="datetime-local"
            />
          </div>
          {create.isError ? (
            <ErrorState message={(create.error as Error).message} />
          ) : null}
          <button
            className="btn btn-primary btn-sm mt-4"
            disabled={create.isPending}
          >
            Create experiment
          </button>
        </form>
      ) : null}
      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} />
      ) : !query.data?.experiments.length ? (
        <EmptyState
          title="No experiments yet"
          description="Create an experiment after establishing a compatible observation baseline."
        />
      ) : (
        <div className="space-y-4">
          {query.data.experiments.map((experiment) => (
            <form
              key={experiment.id}
              className="rounded-xl border border-base-300 bg-base-100 p-5"
              onSubmit={(event) => submitUpdate(event, experiment.id)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{experiment.name}</h2>
                  <p className="mt-1 text-sm text-base-content/60">
                    {experiment.hypothesis}
                  </p>
                </div>
                <span className="badge badge-outline">{experiment.status}</span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="fieldset">
                  <span className="fieldset-legend">Status</span>
                  <select
                    className="select w-full border-base-300"
                    name="status"
                    defaultValue={experiment.status}
                  >
                    {statuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Evaluation due"
                  name="evaluationDueAt"
                  type="datetime-local"
                  defaultValue={experiment.evaluationDueAt?.slice(0, 16)}
                />
                <Area
                  label="Changed URLs"
                  name="changedUrls"
                  defaultValue={experiment.changedUrls.join("\n")}
                />
                <Field
                  label="Change reference"
                  name="changeRef"
                  defaultValue={experiment.changeRef || ""}
                />
                <Area
                  label="Baseline run IDs"
                  name="baselineRunIds"
                  defaultValue={experiment.baselineRunIds.join("\n")}
                  disabled
                />
                <Area
                  label="Follow-up run IDs"
                  name="followupRunIds"
                  defaultValue={experiment.followupRunIds.join("\n")}
                />
                <Area
                  label="Baseline metrics"
                  name="baselineMetrics"
                  defaultValue={metricText(experiment.baselineMetrics)}
                  disabled
                />
                <Area
                  label="Result metrics (JSON)"
                  name="resultMetrics"
                  defaultValue={metricText(experiment.resultMetrics)}
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-base-content/45">
                  Created {formatDate(experiment.createdAt)}
                </p>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={update.isPending}
                >
                  <Save className="size-4" /> Save evaluation
                </button>
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="fieldset">
      <span className="fieldset-legend">{label}</span>
      <input className="input w-full border-base-300" {...props} />
    </label>
  );
}
function Area({
  label,
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="fieldset">
      <span className="fieldset-legend">{label}</span>
      <textarea
        className="textarea min-h-24 w-full border-base-300"
        {...props}
      />
    </label>
  );
}

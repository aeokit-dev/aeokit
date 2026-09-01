import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const insightId = `page-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div
      className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      data-webmcp-insight={insightId}
      aria-label={`${title} view`}
    >
      <div>
        <h1 className="page-heading">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-base-content/60">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="page-actions flex w-full shrink-0 items-center gap-2 sm:w-auto">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 rounded-full bg-base-200 p-3 text-base-content/40">
        <Inbox className="size-5" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-base-content/50">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function FilteredEmptyState({
  hasItems,
  hasActiveFilters,
  emptyTitle,
  emptyDescription,
  emptyAction,
  filteredTitle,
  filteredDescription,
  clearLabel = "Clear search and filters",
  onClear,
}: {
  hasItems: boolean;
  hasActiveFilters: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  filteredTitle: string;
  filteredDescription: string;
  clearLabel?: string;
  onClear: () => void;
}) {
  const filtered = hasItems && hasActiveFilters;
  return (
    <EmptyState
      title={filtered ? filteredTitle : emptyTitle}
      description={filtered ? filteredDescription : emptyDescription}
      action={
        filtered ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onClear}
          >
            {clearLabel}
          </button>
        ) : (
          emptyAction
        )
      }
    />
  );
}

/**
 * Placeholder for a number the app does not have yet. A failed or pending
 * request must not render as a real zero — on this product a fabricated
 * "0 citations" is indistinguishable from a genuine one.
 */
export const unknownValue = "—";

export function ErrorState({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="alert alert-error mb-4 border border-error/30 bg-error/10 text-sm text-base-content"
    >
      <AlertTriangle className="size-4" />
      <span className="grow">{message}</span>
      {onRetry ? (
        <button
          type="button"
          className="btn btn-sm"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      ) : null}
    </div>
  );
}

export function LoadingBlock({ className = "h-32" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-base-200 ${className}`} />
  );
}

export function StatusBadge({ status }: { status: string }) {
  const className =
    status === "succeeded"
      ? "bg-success/15 text-success"
      : status === "failed"
        ? "bg-error/15 text-error"
        : status === "cancelled"
          ? "bg-warning/15 text-warning"
          : status === "running"
            ? "bg-info/15 text-info"
            : "bg-base-200 text-base-content/55";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${className}`}
    >
      <span className="status-dot bg-current" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function mentionOutcomeLabel(
  status: string,
  brandMentioned: boolean,
): "Mentioned" | "Not mentioned" | "Unknown" {
  if (status !== "succeeded") return "Unknown";
  return brandMentioned ? "Mentioned" : "Not mentioned";
}

export function ProviderBadge({
  provider,
  model,
}: {
  provider: string;
  model?: string;
}) {
  const surfaceLabel =
    model === "google-ai-overview"
      ? "Google AI Overview"
      : model === "google-ai-mode"
        ? "Google AI Mode"
        : model === "chatgpt" || model?.startsWith("gpt-")
          ? "ChatGPT"
          : model === "claude" || model?.startsWith("claude-")
            ? "Claude"
            : model === "gemini" || model?.startsWith("gemini-")
              ? "Gemini"
              : model === "perplexity" || model?.startsWith("sonar")
                ? "Perplexity"
                : model === "bing-copilot"
                  ? "Bing Copilot"
                  : null;
  const dataForSeoLabel =
    surfaceLabel &&
    surfaceLabel !== "Google AI Overview" &&
    surfaceLabel !== "Google AI Mode"
      ? `${surfaceLabel} · DataForSEO`
      : (surfaceLabel ?? "DataForSEO AI");
  const brightDataLabel = surfaceLabel
    ? `${surfaceLabel} · Bright Data`
    : "Bright Data";
  const label =
    provider === "brightdata"
      ? brightDataLabel
      : provider === "openai"
        ? "OpenAI"
        : provider === "anthropic"
          ? "Anthropic"
          : provider === "openrouter"
            ? "OpenRouter"
            : provider === "dataforseo"
              ? dataForSeoLabel
              : provider;
  return (
    <span className="badge badge-ghost badge-sm whitespace-nowrap font-medium">
      {label}
    </span>
  );
}

export function formatDate(value: string | Date | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const digits = value === 0 ? 2 : value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatRelative(value: string | null): string {
  if (!value) return "Never";
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

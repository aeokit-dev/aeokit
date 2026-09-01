import type { QueryClient } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider | null = null;
let activeOrganizationId: string | null = null;

export function setApiTokenProvider(provider: TokenProvider | null) {
  tokenProvider = provider;
}

export function setActiveOrganizationId(organizationId: string | null) {
  activeOrganizationId = organizationId;
}

export function resetTenantClientState(
  queryClient: Pick<QueryClient, "clear">,
  organizationId: string | null,
) {
  queryClient.clear();
  setActiveOrganizationId(organizationId);
}

export function tenantQueryKey(...parts: readonly unknown[]) {
  return [
    "tenant",
    activeOrganizationId ?? "no-organization",
    ...parts,
  ] as const;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

function apiErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }
  if (Array.isArray(record.issues)) {
    const messages = record.issues.flatMap((issue) => {
      if (!issue || typeof issue !== "object") return [];
      const message = (issue as Record<string, unknown>).message;
      return typeof message === "string" && message.trim() ? [message] : [];
    });
    if (messages.length) return messages.join("; ");
  }
  if ("error" in record) return apiErrorMessage(record.error, fallback);
  return fallback;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = tokenProvider ? await tokenProvider() : null;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    };
    throw new ApiError(
      apiErrorMessage(payload.error, `Request failed (${response.status})`),
      response.status,
      typeof (payload as { code?: unknown }).code === "string"
        ? (payload as { code: string }).code
        : undefined,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function publicApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

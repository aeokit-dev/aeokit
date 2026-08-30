import type {
  ProviderAdapter,
  ProviderEnvironment,
  ProviderModelOption,
  ProviderRunResult,
  RunOptions,
} from "../types";
import {
  apiError,
  dedupeCitations,
  domainFromUrl,
  resolveCitationUrl,
  stripDataUriImages,
} from "./shared";

const scraperEndpoint = "https://api.brightdata.com/datasets/v3/scrape";
const apiEndpoint = "https://api.brightdata.com";
const maxPromptCharacters = 2_000;
export const brightDataDefaultMaxWaitMs = 210_000;
const maxPollIntervalMs = 10_000;
// The answer bodies inside the archive carry the same inlined favicons the
// stored answer does, so they are stripped here too.
const archivedAnswerFields = [
  "answer_text_markdown",
  "answer_text",
  "answer",
  "markdown",
];
const archivedScraperFields = [
  "answer_text_markdown",
  "answer_text",
  "answer",
  "markdown",
  "model",
  "citations",
  "sources",
  "references",
  "search_sources",
  "error",
  "error_code",
  "error_message",
];

const chatGptOutputFields = [
  "answer_text_markdown",
  "answer_text",
  "model",
  "citations",
  "references",
  "search_sources",
].join("|");

const defaultDatasetIds = {
  chatgpt: "gd_m7aof0k82r803d5bjm",
  perplexity: "gd_m7dhdot1vw9a7gc1n",
  gemini: "gd_mbz66arm2mf9cu856y",
  bingCopilot: "gd_m7di5jy6s9geokz8w",
  googleAiMode: "gd_mcswdt6z2elth3zqr2",
} as const;

export type BrightDataTarget =
  | "google-ai-overview"
  | "google-ai-mode"
  | "chatgpt"
  | "gemini"
  | "perplexity"
  | "bing-copilot";

export const brightDataModelOptions = [
  { id: "chatgpt", label: "ChatGPT", maxPromptCharacters },
  { id: "perplexity", label: "Perplexity", maxPromptCharacters },
  { id: "gemini", label: "Gemini", maxPromptCharacters },
  { id: "google-ai-mode", label: "Google AI Mode", maxPromptCharacters },
  {
    id: "google-ai-overview",
    label: "Google AI Overview",
    maxPromptCharacters,
  },
  { id: "bing-copilot", label: "Bing Copilot", maxPromptCharacters },
] as const satisfies readonly ProviderModelOption[];

const supportedTargets = new Set<string>(
  brightDataModelOptions.map((option) => option.id),
);

export function isBrightDataTarget(value: string): value is BrightDataTarget {
  return supportedTargets.has(value);
}

export function brightDataPromptLimit(_target: string): number {
  return maxPromptCharacters;
}

interface BrightDataSource {
  url?: string;
  href?: string;
  link?: string;
  title?: string;
  source?: string;
  text?: string;
  cited?: boolean;
}

interface BrightDataRecord {
  answer_text_markdown?: string | null;
  answer_text?: string | null;
  answer?: string | null;
  markdown?: string | null;
  model?: string | null;
  citations?: BrightDataSource[] | null;
  sources?: BrightDataSource[] | null;
  references?: BrightDataSource[] | null;
  search_sources?: BrightDataSource[] | null;
  error?: unknown;
  error_code?: string | null;
  error_message?: string | null;
}

interface BrightDataSnapshot {
  snapshot_id?: string;
  status?: "starting" | "running" | "ready" | "failed";
  message?: string;
}

interface AiOverviewText {
  snippet?: string;
  title?: string;
  list?: AiOverviewText[];
}

interface AiOverviewResponse {
  ai_overview?: {
    texts?: AiOverviewText[];
    references?: BrightDataSource[];
  } | null;
}

interface BrightDataSerpResponse {
  body?: unknown;
  status_code?: number;
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Bright Data request aborted");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError(signal);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function responseJson(
  response: Response,
  label: string,
): Promise<unknown> {
  if (!response.ok) throw await apiError(response, label);
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "string") return parsed;
    return JSON.parse(parsed) as unknown;
  } catch {
    throw new Error(`${label} returned an invalid JSON response`);
  }
}

function unwrapSerpResponse(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  if (!("body" in data)) return data;

  const wrapper = data as BrightDataSerpResponse;
  if (typeof wrapper.status_code === "number" && wrapper.status_code >= 400) {
    throw new Error(
      `Bright Data SERP API request failed (${wrapper.status_code})`,
    );
  }
  if (typeof wrapper.body !== "string") return wrapper.body;
  if (!wrapper.body.trim()) return null;

  try {
    const parsed = JSON.parse(wrapper.body) as unknown;
    if (typeof parsed !== "string") return parsed;
    return JSON.parse(parsed) as unknown;
  } catch {
    throw new Error(
      "Bright Data SERP API body returned an invalid JSON response",
    );
  }
}

function snapshotId(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data))
    return undefined;
  const id = (data as BrightDataSnapshot).snapshot_id;
  return typeof id === "string" && id ? id : undefined;
}

async function waitForSnapshot(
  id: string,
  apiKey: string,
  pollIntervalMs: number,
  maxWaitMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const startedAt = Date.now();
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    const progressResponse = await fetch(
      `${apiEndpoint}/datasets/v3/progress/${encodeURIComponent(id)}`,
      { headers: headers(apiKey), ...(signal ? { signal } : {}) },
    );
    const progress = (await responseJson(
      progressResponse,
      "Bright Data snapshot progress",
    )) as BrightDataSnapshot;
    if (progress.status === "failed") {
      throw new Error(
        `Bright Data snapshot ${id} failed${progress.message ? `: ${progress.message}` : ""}`,
      );
    }
    if (progress.status === "ready") {
      const resultResponse = await fetch(
        `${apiEndpoint}/datasets/v3/snapshot/${encodeURIComponent(id)}?format=json`,
        { headers: headers(apiKey), ...(signal ? { signal } : {}) },
      );
      return responseJson(resultResponse, "Bright Data snapshot download");
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) {
      await delay(
        Math.min(
          brightDataPollDelay(Date.now() - startedAt, pollIntervalMs),
          remainingMs,
        ),
        signal,
      );
    }
  }
  throw new Error(`Bright Data snapshot ${id} did not finish in time`);
}

export function brightDataPollDelay(
  elapsedMs: number,
  baseIntervalMs: number,
): number {
  const multiplier =
    elapsedMs < 30_000
      ? 1
      : elapsedMs < 90_000
        ? 2
        : elapsedMs < 150_000
          ? 3
          : 4;
  return Math.min(
    maxPollIntervalMs,
    Math.max(100, baseIntervalMs) * multiplier,
  );
}

function firstRecord(data: unknown): BrightDataRecord {
  const record = Array.isArray(data) ? data[0] : data;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Bright Data returned no scraper result");
  }
  return record as BrightDataRecord;
}

function recordError(record: BrightDataRecord): string | null {
  if (record.error_message) return record.error_message;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    return JSON.stringify(record.error);
  }
  return record.error_code ? `Error ${record.error_code}` : null;
}

function compactScraperData(data: unknown): unknown {
  const records = Array.isArray(data) ? data : [data];
  const compacted = records.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const record = value as Record<string, unknown>;
    const kept = Object.fromEntries(
      archivedScraperFields
        .filter((field) => field in record)
        .map((field) => [
          field,
          archivedAnswerFields.includes(field) &&
          typeof record[field] === "string"
            ? stripDataUriImages(record[field] as string)
            : record[field],
        ]),
    );
    // Name the keys the allowlist discarded. Without this the archive cannot
    // answer whether a payload carried sources under a field we do not read
    // yet — the question that made Google AI Mode's empty citations
    // undiagnosable from stored data alone.
    const dropped = Object.keys(record).filter(
      (field) => !archivedScraperFields.includes(field),
    );
    return dropped.length ? { ...kept, _droppedFields: dropped } : kept;
  });
  return Array.isArray(data) ? compacted : compacted[0];
}

async function citationsFromSources(
  sources: BrightDataSource[],
  signal?: AbortSignal,
) {
  const resolvedUrls = new Map<string, Promise<string>>();
  const citations = await Promise.all(
    sources.flatMap((source) => {
      const url = source.url ?? source.href ?? source.link;
      if (!url) return [];
      const title = source.title ?? source.source ?? source.text;
      let resolved = resolvedUrls.get(url);
      if (!resolved) {
        resolved = resolveCitationUrl(url, signal);
        resolvedUrls.set(url, resolved);
      }
      return [
        resolved.then((resolvedUrl) => ({
          url: resolvedUrl,
          domain: domainFromUrl(resolvedUrl),
          ...(title ? { title } : {}),
        })),
      ];
    }),
  );
  return dedupeCitations(citations);
}

async function citationsFromRecord(
  record: BrightDataRecord,
  signal?: AbortSignal,
) {
  const citedSources = [
    ...(record.citations ?? []),
    ...(record.sources ?? []),
    ...(record.references ?? []),
  ].filter((source) => source.cited !== false);
  const sources = citedSources.length
    ? citedSources
    : (record.search_sources ?? []).filter((source) => source.cited !== false);
  return citationsFromSources(sources, signal);
}

async function parseScraperResult(
  data: unknown,
  target: Exclude<BrightDataTarget, "google-ai-overview">,
  latencyMs: number,
  signal?: AbortSignal,
): Promise<ProviderRunResult> {
  const record = firstRecord(data);
  const error = recordError(record);
  if (error) throw new Error(`Bright Data ${target} scraper error: ${error}`);
  const surface =
    brightDataModelOptions.find((option) => option.id === target)?.label ??
    target;

  return {
    provider: "brightdata",
    model: target,
    answer:
      stripDataUriImages(
        record.answer_text_markdown?.trim() ||
          record.answer_text?.trim() ||
          record.answer?.trim() ||
          record.markdown?.trim() ||
          "",
      ) || `No ${surface} response was returned for this prompt.`,
    citations: await citationsFromRecord(record, signal),
    webQueries: [],
    raw: compactScraperData(data),
    latencyMs,
    costUsd: null,
  };
}

function aiOverviewFragments(items: AiOverviewText[]): string[] {
  return items.flatMap((item) => [
    ...(item.title?.trim() ? [item.title.trim()] : []),
    ...(item.snippet?.trim() ? [item.snippet.trim()] : []),
    ...aiOverviewFragments(item.list ?? []),
  ]);
}

async function parseAiOverviewResult(
  data: unknown,
  latencyMs: number,
  signal?: AbortSignal,
): Promise<ProviderRunResult> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(
      "Bright Data returned an invalid Google AI Overview result",
    );
  }
  const overview = (data as AiOverviewResponse).ai_overview;
  const fragments = aiOverviewFragments(overview?.texts ?? []).filter(
    (fragment, index, all) => fragment !== all[index - 1],
  );
  const citations = await citationsFromSources(
    overview?.references ?? [],
    signal,
  );

  return {
    provider: "brightdata",
    model: "google-ai-overview",
    answer:
      fragments.join("\n\n") ||
      "No Google AI Overview was returned for this query.",
    citations,
    webQueries: [],
    raw: data,
    latencyMs,
    costUsd: null,
  };
}

export function createBrightDataProvider(
  env: ProviderEnvironment = process.env,
): ProviderAdapter {
  const apiKey = env.BRIGHTDATA_API_KEY?.trim() ?? "";
  const serpZone = env.BRIGHTDATA_SERP_ZONE?.trim() ?? "";
  const country = (env.BRIGHTDATA_COUNTRY || "US").toUpperCase();
  const language = (env.BRIGHTDATA_LANGUAGE || "en").toLowerCase();
  const pollIntervalMs = Math.max(
    100,
    Number(env.BRIGHTDATA_POLL_INTERVAL_MS || "2000") || 2_000,
  );
  const maxWaitMs = Math.max(
    1_000,
    Number(env.BRIGHTDATA_MAX_WAIT_MS || String(brightDataDefaultMaxWaitMs)) ||
      brightDataDefaultMaxWaitMs,
  );

  async function scraperRequest(
    datasetId: string,
    input: Record<string, unknown>,
    outputFields?: string,
    options: RunOptions = {},
  ): Promise<unknown> {
    const awaitSnapshot = async (id: string) => {
      try {
        return await waitForSnapshot(
          id,
          apiKey,
          pollIntervalMs,
          maxWaitMs,
          options.signal,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          /snapshot .* failed/i.test(error.message)
        ) {
          await options.onResumeToken?.(null);
        }
        throw error;
      }
    };
    if (options.resumeToken?.trim()) {
      return awaitSnapshot(options.resumeToken.trim());
    }
    const url = new URL(scraperEndpoint);
    url.searchParams.set("dataset_id", datasetId);
    url.searchParams.set("format", "json");
    url.searchParams.set("include_errors", "true");
    if (outputFields) {
      url.searchParams.set("custom_output_fields", outputFields);
    }
    const response = await fetch(url, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify([input]),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const data = await responseJson(response, "Bright Data scraper");
    const id = snapshotId(data);
    if (!id) return data;
    await options.onResumeToken?.(id);
    return awaitSnapshot(id);
  }

  return {
    id: "brightdata",
    label: "Bright Data Scrapers",
    configured: Boolean(apiKey && serpZone),
    defaultModel: "chatgpt",
    modelOptions: brightDataModelOptions,
    async run(
      prompt: string,
      options: RunOptions = {},
    ): Promise<ProviderRunResult> {
      if (!apiKey) throw new Error("Bright Data requires BRIGHTDATA_API_KEY");
      const target = options.model ?? "chatgpt";
      if (!isBrightDataTarget(target)) {
        throw new Error(
          `Bright Data target "${target}" is unsupported; use one of: ${brightDataModelOptions.map((option) => option.id).join(", ")}`,
        );
      }
      const promptLength = Array.from(prompt).length;
      if (promptLength > maxPromptCharacters) {
        throw new Error(
          `Bright Data ${target} prompts must be ${maxPromptCharacters} characters or fewer (${promptLength} provided)`,
        );
      }

      const startedAt = Date.now();
      if (target === "google-ai-overview") {
        if (!serpZone) {
          throw new Error("Google AI Overview requires BRIGHTDATA_SERP_ZONE");
        }
        const searchUrl = new URL("https://www.google.com/search");
        searchUrl.searchParams.set("q", prompt);
        searchUrl.searchParams.set("gl", country);
        searchUrl.searchParams.set("hl", language);
        searchUrl.searchParams.set("brd_ai_overview", "2");
        searchUrl.searchParams.set("brd_json", "json");
        const response = await fetch(`${apiEndpoint}/request`, {
          method: "POST",
          headers: headers(apiKey),
          body: JSON.stringify({
            zone: serpZone,
            url: searchUrl.toString(),
            format: "json",
          }),
          ...(options.signal ? { signal: options.signal } : {}),
        });
        const data = unwrapSerpResponse(
          await responseJson(response, "Bright Data SERP API"),
        );
        return parseAiOverviewResult(
          data,
          Date.now() - startedAt,
          options.signal,
        );
      }

      let datasetId: string;
      let outputFields: string | undefined;
      let input: Record<string, unknown>;
      if (target === "chatgpt") {
        datasetId = defaultDatasetIds.chatgpt;
        outputFields = chatGptOutputFields;
        input = {
          url: "https://chatgpt.com/",
          prompt,
          web_search: options.webSearch !== false,
        };
      } else if (target === "google-ai-mode") {
        datasetId = defaultDatasetIds.googleAiMode;
        const searchUrl = new URL("https://www.google.com/search");
        searchUrl.searchParams.set("udm", "50");
        searchUrl.searchParams.set("q", prompt);
        input = { url: searchUrl.toString(), prompt, country };
      } else {
        const datasetIds = {
          perplexity: defaultDatasetIds.perplexity,
          gemini: defaultDatasetIds.gemini,
          "bing-copilot": defaultDatasetIds.bingCopilot,
        } as const;
        const surfaceUrls = {
          perplexity: "https://www.perplexity.ai/",
          gemini: "https://gemini.google.com/",
          "bing-copilot": "https://copilot.microsoft.com/",
        } as const;
        datasetId = datasetIds[target];
        input = { url: surfaceUrls[target], prompt, country };
      }

      const data = await scraperRequest(
        datasetId,
        input,
        outputFields,
        options,
      );
      return parseScraperResult(
        data,
        target,
        Date.now() - startedAt,
        options.signal,
      );
    },
  };
}

export { defaultDatasetIds as brightDataDatasetIds };

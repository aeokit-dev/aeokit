import type {
  ProviderAdapter,
  ProviderEnvironment,
  ProviderModelOption,
  ProviderRunResult,
  RunOptions,
} from "../types.js";
import { apiError, dedupeCitations, domainFromUrl } from "./shared.js";

const googleAiOverviewEndpoint =
  "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
const googleAiModeEndpoint =
  "https://api.dataforseo.com/v3/serp/google/ai_mode/live/advanced";
const googleMaxPromptCharacters = 700;
const llmScraperMaxPromptCharacters = 2_000;
const llmResponsesMaxPromptCharacters = 500;

export type DataForSeoTarget =
  | "google-ai-overview"
  | "google-ai-mode"
  | "chatgpt"
  | "claude"
  | "gemini"
  | "perplexity";

export const dataForSeoModelOptions = [
  {
    id: "google-ai-overview",
    label: "Google AI Overview",
    maxPromptCharacters: googleMaxPromptCharacters,
  },
  {
    id: "google-ai-mode",
    label: "Google AI Mode",
    maxPromptCharacters: googleMaxPromptCharacters,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    maxPromptCharacters: llmScraperMaxPromptCharacters,
  },
  {
    id: "claude",
    label: "Claude",
    maxPromptCharacters: llmResponsesMaxPromptCharacters,
  },
  {
    id: "gemini",
    label: "Gemini",
    maxPromptCharacters: llmScraperMaxPromptCharacters,
  },
  {
    id: "perplexity",
    label: "Perplexity",
    maxPromptCharacters: llmResponsesMaxPromptCharacters,
  },
] as const satisfies readonly ProviderModelOption[];

const supportedTargets = new Set<string>(
  dataForSeoModelOptions.map((option) => option.id),
);

export function isDataForSeoTarget(value: string): value is DataForSeoTarget {
  return supportedTargets.has(value);
}

export function dataForSeoPromptLimit(target: string): number {
  if (target === "google-ai-overview" || target === "google-ai-mode") {
    return googleMaxPromptCharacters;
  }
  return target === "chatgpt" || target === "gemini"
    ? llmScraperMaxPromptCharacters
    : llmResponsesMaxPromptCharacters;
}

interface DataForSeoReference {
  url?: string;
  title?: string;
  source?: string;
  source_name?: string;
}

interface DataForSeoSection {
  type?: string;
  text?: string | null;
  annotations?: DataForSeoReference[] | null;
}

interface DataForSeoItem {
  type?: string;
  markdown?: string;
  text?: string | null;
  references?: DataForSeoReference[] | null;
  annotations?: DataForSeoReference[] | null;
  sources?: DataForSeoReference[] | null;
  sections?: DataForSeoSection[];
  items?: DataForSeoItem[];
  components?: DataForSeoItem[];
}

interface DataForSeoResult {
  model?: string;
  model_name?: string;
  markdown?: string | null;
  sources?: DataForSeoReference[] | null;
  fan_out_queries?: string[] | null;
  items?: DataForSeoItem[];
}

interface DataForSeoTask {
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: DataForSeoResult[];
}

interface DataForSeoResponse {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: DataForSeoTask[];
}

interface DataForSeoRequest {
  endpoint: string;
  body: Record<string, unknown>;
}

function taskError(task: DataForSeoTask | undefined): Error {
  const code = task?.status_code ?? "unknown";
  const message = task?.status_message ?? "No task response was returned";
  return new Error(`DataForSEO API error (${code}): ${message}`);
}

function isTransientTaskError(task: DataForSeoTask | undefined): boolean {
  const code = task?.status_code ?? 0;
  return code === 40602 || code >= 50000;
}

function isBase64Credential(value: string): boolean {
  try {
    const normalized = value.trim().replace(/=+$/, "");
    const decoded = Buffer.from(value.trim(), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    const encoded = Buffer.from(decoded, "utf8")
      .toString("base64")
      .replace(/=+$/, "");
    return (
      separator > 0 && separator < decoded.length - 1 && encoded === normalized
    );
  } catch {
    return false;
  }
}

function validateResponse(data: DataForSeoResponse): DataForSeoTask {
  if (data.status_code && data.status_code !== 20000) {
    throw new Error(
      `DataForSEO API error (${data.status_code}): ${data.status_message ?? "Unknown error"}`,
    );
  }
  const task = data.tasks?.[0];
  if (task?.status_code !== 20000 || !task.result?.length) {
    throw taskError(task);
  }
  return task;
}

function referencesFromItems(items: DataForSeoItem[]): DataForSeoReference[] {
  const references: DataForSeoReference[] = [];
  for (const item of items) {
    references.push(
      ...(item.references ?? []),
      ...(item.annotations ?? []),
      ...(item.sources ?? []),
    );
    for (const section of item.sections ?? []) {
      references.push(...(section.annotations ?? []));
    }
    references.push(
      ...referencesFromItems(item.items ?? []),
      ...referencesFromItems(item.components ?? []),
    );
  }
  return references;
}

function citationsFromItems(items: DataForSeoItem[]) {
  return dedupeCitations(
    referencesFromItems(items).flatMap((reference) => {
      if (!reference.url) return [];
      const title =
        reference.title ?? reference.source ?? reference.source_name;
      return [
        {
          url: reference.url,
          domain: domainFromUrl(reference.url),
          ...(title ? { title } : {}),
        },
      ];
    }),
  );
}

function nestedMarkdown(item: DataForSeoItem): string {
  if (item.markdown?.trim()) return item.markdown.trim();
  return [...(item.items ?? []), ...(item.components ?? [])]
    .map(nestedMarkdown)
    .filter(Boolean)
    .join("\n\n");
}

function responseCost(data: DataForSeoResponse, task: DataForSeoTask) {
  return typeof data.cost === "number"
    ? data.cost
    : typeof task.cost === "number"
      ? task.cost
      : null;
}

function parseGoogleResult(
  data: DataForSeoResponse,
  target: "google-ai-overview" | "google-ai-mode",
  latencyMs: number,
): ProviderRunResult {
  const task = validateResponse(data);
  const result = task.result?.[0];
  const overview = result?.items?.find((item) => item.type === "ai_overview");
  const citations = citationsFromItems(overview ? [overview] : []);
  const surface =
    target === "google-ai-mode" ? "Google AI Mode" : "Google AI Overview";

  return {
    provider: "dataforseo",
    model: target,
    answer:
      (overview ? nestedMarkdown(overview) : "") ||
      `No ${surface} was returned for this query.`,
    citations,
    webQueries: citations.length > 0 ? ["Unavailable from provider"] : [],
    raw: data,
    latencyMs,
    costUsd: responseCost(data, task),
  };
}

function parseLlmResult(
  data: DataForSeoResponse,
  target: Exclude<DataForSeoTarget, "google-ai-overview" | "google-ai-mode">,
  latencyMs: number,
): ProviderRunResult {
  const task = validateResponse(data);
  const result = task.result?.[0];
  const items = result?.items ?? [];
  const messages = items
    .filter((item) => item.type === "message")
    .map((item) =>
      (item.sections ?? [])
        .filter((section) => section.type === "text" && section.text)
        .map((section) => section.text?.trim())
        .filter(Boolean)
        .join(""),
    )
    .filter(Boolean);
  const citations = citationsFromItems(items);
  const surface =
    dataForSeoModelOptions.find((option) => option.id === target)?.label ??
    target;

  return {
    provider: "dataforseo",
    model: result?.model_name ?? target,
    answer:
      messages.at(-1) ?? `No ${surface} response was returned for this prompt.`,
    citations,
    webQueries: citations.length > 0 ? ["Unavailable from provider"] : [],
    raw: data,
    latencyMs,
    costUsd: responseCost(data, task),
  };
}

function parseLlmScraperResult(
  data: DataForSeoResponse,
  target: "chatgpt" | "gemini",
  latencyMs: number,
): ProviderRunResult {
  const task = validateResponse(data);
  const result = task.result?.[0];
  const items = result?.items ?? [];
  const citations = dedupeCitations([
    ...(result?.sources ?? []).flatMap((source) => {
      if (!source.url) return [];
      const title = source.title ?? source.source ?? source.source_name;
      return [
        {
          url: source.url,
          domain: domainFromUrl(source.url),
          ...(title ? { title } : {}),
        },
      ];
    }),
    ...citationsFromItems(items),
  ]);
  const surface = target === "chatgpt" ? "ChatGPT" : "Gemini";

  return {
    provider: "dataforseo",
    model: target,
    answer:
      result?.markdown?.trim() ||
      items.map(nestedMarkdown).filter(Boolean).join("\n\n") ||
      `No ${surface} response was returned for this prompt.`,
    citations,
    webQueries: (result?.fan_out_queries ?? []).filter(Boolean),
    raw: data,
    latencyMs,
    costUsd: responseCost(data, task),
  };
}

export function createDataForSeoProvider(
  env: ProviderEnvironment = process.env,
): ProviderAdapter {
  const apiKey = env.DATAFORSEO_API_KEY?.trim() ?? "";
  const configuredLocationCode = Number(env.DATAFORSEO_LOCATION_CODE || "2840");
  const locationCode =
    Number.isInteger(configuredLocationCode) && configuredLocationCode > 0
      ? configuredLocationCode
      : 2840;
  const languageCode = env.DATAFORSEO_LANGUAGE_CODE || "en";
  const device = env.DATAFORSEO_DEVICE === "mobile" ? "mobile" : "desktop";
  const os = env.DATAFORSEO_OS || (device === "mobile" ? "android" : "macos");
  const configuredCountry = (
    env.DATAFORSEO_COUNTRY_ISO_CODE || "US"
  ).toUpperCase();
  const countryIsoCode = /^[A-Z]{2}$/.test(configuredCountry)
    ? configuredCountry
    : "US";
  const city = env.DATAFORSEO_CITY?.trim();
  const retryDelayMs = Number(env.DATAFORSEO_RETRY_DELAY_MS || "1500");
  const llmModels = {
    claude: env.DATAFORSEO_CLAUDE_MODEL || "claude-sonnet-4-0",
    perplexity: env.DATAFORSEO_PERPLEXITY_MODEL || "sonar",
  } as const;

  function requestForTarget(
    target: DataForSeoTarget,
    prompt: string,
    webSearch: boolean,
  ): DataForSeoRequest {
    if (target === "google-ai-overview" || target === "google-ai-mode") {
      return {
        endpoint:
          target === "google-ai-mode"
            ? googleAiModeEndpoint
            : googleAiOverviewEndpoint,
        body: {
          keyword: prompt,
          location_code: locationCode,
          language_code: languageCode,
          device,
          os,
          ...(target === "google-ai-overview"
            ? { depth: 10, load_async_ai_overview: true }
            : {}),
        },
      };
    }

    if (target === "chatgpt" || target === "gemini") {
      return {
        endpoint: `https://api.dataforseo.com/v3/ai_optimization/${target === "chatgpt" ? "chat_gpt" : target}/llm_scraper/live/advanced`,
        body: {
          keyword: prompt,
          location_code: locationCode,
          language_code: languageCode,
          ...(target === "chatgpt" ? { force_web_search: webSearch } : {}),
        },
      };
    }

    const body: Record<string, unknown> = {
      user_prompt: prompt,
      model_name: llmModels[target],
      max_output_tokens: 4_096,
    };
    if (target !== "perplexity") body.web_search = webSearch;
    if (webSearch) {
      body.web_search_country_iso_code = countryIsoCode;
      if (city && target !== "perplexity") body.web_search_city = city;
    }
    return {
      endpoint: `https://api.dataforseo.com/v3/ai_optimization/${target}/llm_responses/live`,
      body,
    };
  }

  return {
    id: "dataforseo",
    label: "DataForSEO AI",
    configured: Boolean(apiKey),
    defaultModel: "google-ai-overview",
    modelOptions: dataForSeoModelOptions,
    async run(
      prompt: string,
      options: RunOptions = {},
    ): Promise<ProviderRunResult> {
      if (!apiKey) {
        throw new Error("DataForSEO requires DATAFORSEO_API_KEY");
      }
      if (!isBase64Credential(apiKey)) {
        throw new Error(
          "DATAFORSEO_API_KEY must be the Base64-encoded value of login:API-password",
        );
      }
      const target = options.model ?? "google-ai-overview";
      if (!isDataForSeoTarget(target)) {
        throw new Error(
          `DataForSEO target "${target}" is unsupported; use one of: ${dataForSeoModelOptions.map((option) => option.id).join(", ")}`,
        );
      }
      const promptLength = Array.from(prompt).length;
      const promptLimit = dataForSeoPromptLimit(target);
      if (promptLength > promptLimit) {
        throw new Error(
          `DataForSEO ${target} prompts must be ${promptLimit} characters or fewer (${promptLength} provided)`,
        );
      }

      const request = requestForTarget(
        target,
        prompt,
        options.webSearch !== false,
      );
      const startedAt = Date.now();
      let lastError: Error | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let response: Response;
        try {
          response = await fetch(request.endpoint, {
            method: "POST",
            headers: {
              Authorization: `Basic ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([request.body]),
            ...(options.signal ? { signal: options.signal } : {}),
          });
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, retryDelayMs * (attempt + 1)),
            );
            continue;
          }
          throw lastError;
        }

        if (!response.ok) throw await apiError(response, "DataForSEO");
        const data = (await response.json()) as DataForSeoResponse;
        const task = data.tasks?.[0];
        try {
          return target === "google-ai-overview" || target === "google-ai-mode"
            ? parseGoogleResult(data, target, Date.now() - startedAt)
            : target === "chatgpt" || target === "gemini"
              ? parseLlmScraperResult(data, target, Date.now() - startedAt)
              : parseLlmResult(data, target, Date.now() - startedAt);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (!isTransientTaskError(task) || attempt === 2) throw lastError;
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelayMs * (attempt + 1)),
          );
        }
      }
      throw lastError ?? new Error("DataForSEO request failed");
    },
  };
}

export { googleMaxPromptCharacters as dataForSeoMaxPromptCharacters };

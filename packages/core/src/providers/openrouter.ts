import type { AiChatConversationMessage } from "../ai-chat.js";
import type { AiChatUiAction, AiChatUiContext } from "../ai-chat.js";
import { aiChatAppPages, validateAiChatUiActions } from "../ai-chat.js";
import type {
  CitationResult,
  ProviderAdapter,
  ProviderEnvironment,
  ProviderRunResult,
  RunOptions,
} from "../types.js";
import { apiError, dedupeCitations, domainFromUrl } from "./shared.js";

interface OpenRouterResponse {
  model?: string;
  usage?: { cost?: number | string };
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
        url_citation?: { url?: string; title?: string };
      }>;
    };
  }>;
}

export interface OpenRouterChatResult {
  model: string;
  answer: string;
  citations: CitationResult[];
  raw: unknown;
  latencyMs: number;
  costUsd: number | null;
  uiActions: AiChatUiAction[];
}

export type AiChatBackend = "local" | "openrouter";

export function configuredAiChatBackends(
  environment: ProviderEnvironment = process.env,
) {
  return [
    ...(environment.AI_CHAT_BASE_URL?.trim()
      ? [
          {
            id: "local" as const,
            label: "Local",
            model: environment.AI_CHAT_MODEL?.trim() || "Local chat model",
          },
        ]
      : []),
    ...(environment.OPENROUTER_API_KEY?.trim()
      ? [
          {
            id: "openrouter" as const,
            label: "OpenRouter",
            model: environment.OPENROUTER_MODEL?.trim() || "perplexity/sonar",
          },
        ]
      : []),
  ];
}

export async function runOpenRouterChat({
  environment = process.env,
  messages,
  system,
  model: requestedModel,
  webSearch,
  signal,
  uiContext,
  backend: requestedBackend,
  createPrompts,
}: {
  environment?: ProviderEnvironment;
  messages: AiChatConversationMessage[];
  system?: string;
  model?: string;
  webSearch?: boolean;
  signal?: AbortSignal;
  uiContext?: AiChatUiContext;
  backend?: AiChatBackend;
  createPrompts?: (prompts: string[]) => Promise<unknown>;
}): Promise<OpenRouterChatResult> {
  const backend =
    requestedBackend ??
    (environment.AI_CHAT_BASE_URL?.trim() ? "local" : "openrouter");
  const local = backend === "local";
  const apiKey = (
    local
      ? environment.AI_CHAT_API_KEY || "local"
      : environment.OPENROUTER_API_KEY
  )?.trim();
  if (!apiKey)
    throw new Error(
      local
        ? "AI_CHAT_BASE_URL is not configured"
        : "OPENROUTER_API_KEY is not configured",
    );
  const baseUrl = local
    ? environment.AI_CHAT_BASE_URL?.trim().replace(/\/+$/, "")
    : "https://openrouter.ai/api/v1";
  if (!baseUrl) throw new Error("AI_CHAT_BASE_URL is not configured");

  const startedAt = Date.now();
  let model =
    requestedModel?.trim() ||
    (local
      ? environment.AI_CHAT_MODEL?.trim()
      : environment.OPENROUTER_MODEL?.trim()) ||
    "perplexity/sonar";
  const configuredWebSearch = local
    ? environment.AI_CHAT_WEB_SEARCH?.trim().toLowerCase() === "true"
    : true;
  if (
    (webSearch ?? configuredWebSearch) &&
    !local &&
    !model.endsWith(":online")
  )
    model += ":online";
  const requestMessages = [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    ...messages,
  ];
  const tools = [
    ...(uiContext
      ? [
          {
            type: "function",
            function: {
              name: "list_ui_insights",
              description:
                "List the read-only evidence visible on the user's current aeokit page. Call this before answering questions about what is visible, examining the current app page, or selecting an insight to show.",
              parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "show_ui_insight",
              description:
                "Offer a user-controlled button that scrolls to and highlights one supplied current-page insight. Use an exact insightId returned by list_ui_insights. This does not navigate, click, write, or execute automatically.",
              parameters: {
                type: "object",
                properties: {
                  insightId: {
                    type: "string",
                    enum: uiContext.insights.map((item) => item.id),
                  },
                },
                required: ["insightId"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "open_app_page",
              description:
                "Navigate to or offer an allowlisted aeokit page. Set executeImmediately=true only when the user's latest message explicitly asks to go, open, show, or take them to that page; otherwise set false to offer a button. Never use immediate execution for a mere recommendation. This cannot modify data.",
              parameters: {
                type: "object",
                properties: {
                  page: {
                    type: "string",
                    enum: Object.keys(aiChatAppPages),
                  },
                  executeImmediately: {
                    type: "boolean",
                    description:
                      "True only for an explicit navigation request in the latest user message; false for suggestions.",
                  },
                },
                required: ["page", "executeImmediately"],
                additionalProperties: false,
              },
            },
          },
        ]
      : []),
    ...(createPrompts
      ? [
          {
            type: "function",
            function: {
              name: "create_tracked_prompts",
              description:
                "Create prompts in the current aeokit project when the user explicitly asks you to create, add, save, or track them. Use concrete, ready-to-run questions, not placeholder templates. This writes project data and should not be used when the user only asks for suggestions.",
              parameters: {
                type: "object",
                properties: {
                  prompts: {
                    type: "array",
                    minItems: 1,
                    maxItems: 20,
                    items: { type: "string", minLength: 5, maxLength: 2_000 },
                  },
                },
                required: ["prompts"],
                additionalProperties: false,
              },
            },
          },
        ]
      : []),
  ];
  const request = async (bodyMessages: unknown[]) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          environment.APP_URL ?? "https://github.com/aeokit-dev/aeokit",
        "X-OpenRouter-Title": "aeokit",
      },
      body: JSON.stringify({
        model,
        messages: bodyMessages,
        max_tokens: 4_000,
        ...(tools.length ? { tools, tool_choice: "auto" } : {}),
      }),
      ...(signal ? { signal } : {}),
    });
  let response = await request(requestMessages);
  if (!response.ok) throw await apiError(response, "OpenRouter");

  const firstData = (await response.json()) as OpenRouterResponse;
  const firstMessage = firstData.choices?.[0]?.message;
  const allToolCalls = [...(firstMessage?.tool_calls ?? [])];
  let promptWriteCompleted = false;
  let data = firstData;
  if (firstMessage?.tool_calls?.length && tools.length) {
    const toolResults = await Promise.all(
      firstMessage.tool_calls.map(async (call, index) => {
        const name = call.function?.name;
        let content: unknown = { error: "Unknown tool" };
        if (name === "list_ui_insights" && uiContext)
          content = { insights: uiContext.insights };
        else if (name === "show_ui_insight" || name === "open_app_page")
          content = { offered: true };
        else if (name === "create_tracked_prompts" && createPrompts) {
          try {
            const args = JSON.parse(call.function?.arguments ?? "{}") as {
              prompts?: unknown;
            };
            const promptValues = Array.isArray(args.prompts)
              ? args.prompts
                  .filter((value): value is string => typeof value === "string")
                  .map((value) => value.trim())
                  .filter((value) => value.length >= 5 && value.length <= 2_000)
                  .slice(0, 20)
              : [];
            if (promptValues.length) {
              content = await createPrompts(promptValues);
              promptWriteCompleted = true;
            } else content = { error: "No valid prompts were provided" };
          } catch (error) {
            content = {
              error:
                error instanceof Error
                  ? error.message
                  : "Prompt creation failed",
            };
          }
        }
        return {
          role: "tool",
          tool_call_id: call.id ?? `aeokit-tool-${index}`,
          content: JSON.stringify(content),
        };
      }),
    );
    response = await request([
      ...requestMessages,
      {
        role: "assistant",
        content: firstMessage.content ?? "",
        tool_calls: firstMessage.tool_calls,
      },
      ...toolResults,
    ]);
    if (!response.ok) throw await apiError(response, "OpenRouter");
    data = (await response.json()) as OpenRouterResponse;
    allToolCalls.push(...(data.choices?.[0]?.message?.tool_calls ?? []));
  }
  const message = data.choices?.[0]?.message;
  const citations = (message?.annotations ?? [])
    .filter((annotation) => annotation.type === "url_citation")
    .flatMap((annotation) => {
      const value = annotation.url_citation ?? annotation;
      if (!value.url) return [];
      return [
        {
          url: value.url,
          domain: domainFromUrl(value.url),
          ...(value.title ? { title: value.title } : {}),
        },
      ];
    });
  const requestedActions: unknown[] = [];
  for (const call of allToolCalls) {
    if (call.type !== "function") continue;
    const functionName = call.function?.name;
    try {
      const args = JSON.parse(call.function?.arguments ?? "{}") as Record<
        string,
        unknown
      >;
      if (functionName === "show_ui_insight")
        requestedActions.push({
          type: "show_ui_insight",
          insightId: args.insightId,
        });
      if (functionName === "open_app_page")
        requestedActions.push({
          type: "open_app_page",
          page: args.page,
          executeImmediately: args.executeImmediately,
        });
    } catch {
      continue;
    }
  }
  if (promptWriteCompleted)
    requestedActions.push({
      type: "open_app_page",
      page: "prompts",
      executeImmediately: true,
    });

  return {
    model: data.model ?? model.replace(/:online$/, ""),
    answer: message?.content ?? "",
    citations: dedupeCitations(citations),
    uiActions: validateAiChatUiActions(requestedActions, uiContext),
    raw: data,
    latencyMs: Date.now() - startedAt,
    costUsd:
      typeof data.usage?.cost === "number"
        ? data.usage.cost
        : typeof data.usage?.cost === "string" &&
            Number.isFinite(Number(data.usage.cost))
          ? Number(data.usage.cost)
          : null,
  };
}

export function createOpenRouterProvider(
  env: ProviderEnvironment = process.env,
): ProviderAdapter {
  const apiKey = (env.OPENROUTER_API_KEY ?? "").trim();
  const defaultModel = env.OPENROUTER_MODEL?.trim() || "perplexity/sonar";

  return {
    id: "openrouter",
    label: "OpenRouter",
    configured: Boolean(apiKey),
    defaultModel,
    async run(
      prompt: string,
      options: RunOptions = {},
    ): Promise<ProviderRunResult> {
      const result = await runOpenRouterChat({
        environment: env,
        messages: [{ role: "user", content: prompt }],
        model: options.model || defaultModel,
        webSearch: options.webSearch !== false,
        ...(options.signal ? { signal: options.signal } : {}),
      });

      return {
        provider: "openrouter",
        ...result,
        webQueries:
          result.citations.length > 0 ? ["Unavailable from provider"] : [],
      };
    },
  };
}

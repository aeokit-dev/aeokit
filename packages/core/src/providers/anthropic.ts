import type {
  ProviderAdapter,
  ProviderEnvironment,
  ProviderRunResult,
  RunOptions,
} from "../types";
import { apiError, dedupeCitations, domainFromUrl } from "./shared";

interface AnthropicContent {
  type?: string;
  text?: string;
  name?: string;
  input?: { query?: string };
  citations?: Array<{ type?: string; url?: string; title?: string }>;
  content?: Array<{ type?: string; url?: string; title?: string }>;
}

interface AnthropicResponse {
  model?: string;
  content?: AnthropicContent[];
}

export function createAnthropicProvider(
  env: ProviderEnvironment = process.env,
): ProviderAdapter {
  const apiKey = env.ANTHROPIC_API_KEY ?? "";
  const defaultModel = env.ANTHROPIC_MODEL || "claude-sonnet-5";

  return {
    id: "anthropic",
    label: "Anthropic",
    configured: Boolean(apiKey),
    defaultModel,
    async run(
      prompt: string,
      options: RunOptions = {},
    ): Promise<ProviderRunResult> {
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
      const startedAt = Date.now();
      const model = options.model || defaultModel;
      const body: Record<string, unknown> = {
        model,
        max_tokens: 4_000,
        messages: [{ role: "user", content: prompt }],
      };
      if (options.webSearch !== false) {
        body.tools = [
          { type: "web_search_20250305", name: "web_search", max_uses: 5 },
        ];
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      if (!response.ok) throw await apiError(response, "Anthropic");
      const data = (await response.json()) as AnthropicResponse;
      const texts: string[] = [];
      const webQueries: string[] = [];
      const citations: Array<{ url: string; domain: string; title?: string }> =
        [];

      for (const block of data.content ?? []) {
        if (block.type === "text" && block.text) texts.push(block.text);
        if (
          block.type === "server_tool_use" &&
          block.name === "web_search" &&
          block.input?.query
        ) {
          webQueries.push(block.input.query);
        }
        for (const citation of block.citations ?? []) {
          if (citation.type !== "web_search_result_location" || !citation.url)
            continue;
          citations.push({
            url: citation.url,
            domain: domainFromUrl(citation.url),
            ...(citation.title ? { title: citation.title } : {}),
          });
        }
        if (block.type === "web_search_tool_result") {
          for (const result of block.content ?? []) {
            if (result.type !== "web_search_result" || !result.url) continue;
            citations.push({
              url: result.url,
              domain: domainFromUrl(result.url),
              ...(result.title ? { title: result.title } : {}),
            });
          }
        }
      }

      return {
        provider: "anthropic",
        model: data.model ?? model,
        answer: texts.join("\n"),
        citations: dedupeCitations(citations),
        webQueries: [...new Set(webQueries)],
        raw: data,
        latencyMs: Date.now() - startedAt,
        costUsd: null,
      };
    },
  };
}

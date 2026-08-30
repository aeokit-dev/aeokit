import type {
  ProviderAdapter,
  ProviderEnvironment,
  ProviderRunResult,
  RunOptions,
} from "../types.js";
import { apiError, dedupeCitations, domainFromUrl } from "./shared.js";

interface OpenAIResponse {
  model?: string;
  output?: Array<{
    type?: string;
    action?: { query?: string; queries?: string[] };
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
        url_citation?: { url?: string; title?: string };
      }>;
    }>;
  }>;
}

export function createOpenAIProvider(
  env: ProviderEnvironment = process.env,
): ProviderAdapter {
  const apiKey = env.OPENAI_API_KEY ?? "";
  const defaultModel = env.OPENAI_MODEL || "gpt-5-mini";

  return {
    id: "openai",
    label: "OpenAI",
    configured: Boolean(apiKey),
    defaultModel,
    async run(
      prompt: string,
      options: RunOptions = {},
    ): Promise<ProviderRunResult> {
      if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
      const startedAt = Date.now();
      const model = options.model || defaultModel;
      const body: Record<string, unknown> = {
        model,
        input: prompt,
        max_output_tokens: 4_000,
      };
      if (options.webSearch !== false) body.tools = [{ type: "web_search" }];

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      if (!response.ok) throw await apiError(response, "OpenAI");
      const data = (await response.json()) as OpenAIResponse;
      const texts: string[] = [];
      const citations: Array<{ url: string; domain: string; title?: string }> =
        [];
      const webQueries: string[] = [];

      for (const item of data.output ?? []) {
        if (item.action?.query) webQueries.push(item.action.query);
        if (item.action?.queries) webQueries.push(...item.action.queries);
        for (const content of item.content ?? []) {
          if (content.type === "output_text" && content.text)
            texts.push(content.text);
          for (const annotation of content.annotations ?? []) {
            if (annotation.type !== "url_citation") continue;
            const value = annotation.url_citation ?? annotation;
            if (!value.url) continue;
            citations.push({
              url: value.url,
              domain: domainFromUrl(value.url),
              ...(value.title ? { title: value.title } : {}),
            });
          }
        }
      }

      return {
        provider: "openai",
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

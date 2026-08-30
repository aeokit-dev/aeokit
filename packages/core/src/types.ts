export type ProviderId =
  "brightdata" | "openai" | "anthropic" | "openrouter" | "dataforseo";

export type ProviderEnvironment = Record<string, string | undefined>;

export interface CitationResult {
  url: string;
  domain: string;
  title?: string;
  position: number;
}

export interface ProviderRunResult {
  provider: ProviderId;
  model: string;
  answer: string;
  citations: CitationResult[];
  webQueries: string[];
  raw: unknown;
  latencyMs: number;
  costUsd: number | null;
}

export interface RunOptions {
  model?: string;
  webSearch?: boolean;
  signal?: AbortSignal;
  resumeToken?: string;
  onResumeToken?: (token: string | null) => Promise<void> | void;
}

export interface ProviderModelOption {
  id: string;
  label: string;
  maxPromptCharacters?: number;
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  configured: boolean;
  defaultModel: string;
  modelOptions?: readonly ProviderModelOption[];
  run(prompt: string, options?: RunOptions): Promise<ProviderRunResult>;
}

export interface TrackableEntity {
  name: string;
  aliases?: string[];
  domains?: string[];
}

export type CitationCategory =
  "owned" | "competitor" | "social" | "institutional" | "other";

export interface CitationClassification {
  category: CitationCategory;
  competitorName?: string;
}

export interface RunAnalysis {
  brandMentioned: boolean;
  competitorsMentioned: string[];
}

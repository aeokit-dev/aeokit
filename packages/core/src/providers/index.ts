import type {
  ProviderAdapter,
  ProviderEnvironment,
  ProviderId,
} from "../types";
import { createAnthropicProvider } from "./anthropic";
import { createBrightDataProvider } from "./brightdata";
import { createDataForSeoProvider } from "./dataforseo";
import { createOpenAIProvider } from "./openai";
import { createOpenRouterProvider } from "./openrouter";

export function createProviderRegistry(
  env: ProviderEnvironment = process.env,
): Map<ProviderId, ProviderAdapter> {
  const providers = [
    createBrightDataProvider(env),
    createOpenAIProvider(env),
    createAnthropicProvider(env),
    createOpenRouterProvider(env),
    createDataForSeoProvider(env),
  ];
  return new Map(providers.map((provider) => [provider.id, provider]));
}

export { createAnthropicProvider } from "./anthropic";
export {
  brightDataDefaultMaxWaitMs,
  brightDataModelOptions,
  brightDataPollDelay,
  brightDataPromptLimit,
  createBrightDataProvider,
  isBrightDataTarget,
  type BrightDataTarget,
} from "./brightdata";
export {
  createDataForSeoProvider,
  dataForSeoModelOptions,
  dataForSeoPromptLimit,
  isDataForSeoTarget,
  type DataForSeoTarget,
} from "./dataforseo";
export { createOpenAIProvider } from "./openai";
export {
  configuredAiChatBackends,
  createOpenRouterProvider,
  runOpenRouterChat,
} from "./openrouter";
export type { AiChatBackend } from "./openrouter";
export { resolveCitationUrl } from "./shared";

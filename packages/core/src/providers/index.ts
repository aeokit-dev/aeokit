import type {
  ProviderAdapter,
  ProviderEnvironment,
  ProviderId,
} from "../types.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createBrightDataProvider } from "./brightdata.js";
import { createDataForSeoProvider } from "./dataforseo.js";
import { createOpenAIProvider } from "./openai.js";
import { createOpenRouterProvider } from "./openrouter.js";

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

export { createAnthropicProvider } from "./anthropic.js";
export {
  brightDataDefaultMaxWaitMs,
  brightDataModelOptions,
  brightDataPollDelay,
  brightDataPromptLimit,
  createBrightDataProvider,
  isBrightDataTarget,
  type BrightDataTarget,
} from "./brightdata.js";
export {
  createDataForSeoProvider,
  dataForSeoModelOptions,
  dataForSeoPromptLimit,
  isDataForSeoTarget,
  type DataForSeoTarget,
} from "./dataforseo.js";
export { createOpenAIProvider } from "./openai.js";
export {
  configuredAiChatBackends,
  createOpenRouterProvider,
  runOpenRouterChat,
} from "./openrouter.js";
export type { AiChatBackend } from "./openrouter.js";
export { resolveCitationUrl } from "./shared.js";

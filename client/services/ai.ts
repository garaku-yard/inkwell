/** AI service — chat completion streaming and provider discovery. Thin
 *  wrappers around the Storage abstraction. */
import { getStorage } from "@/lib/storage"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface AIChatRequest {
  messages: ChatMessage[]
  provider?: string
  model?: string
  stream?: boolean
}

/** @deprecated Use `AIChatRequest` with a `messages` array instead. */
export interface LegacyAIChatRequest {
  prompt: string
  model: string
}

export interface AIProvidersResponse {
  providers: string[]
  config: Record<string, { default_model: string }>
}

export const getAvailableAIProviders = (): Promise<AIProvidersResponse> =>
  getStorage().ai.listProviders()

export const streamChatCompletion = (
  data: AIChatRequest | LegacyAIChatRequest,
): Promise<ReadableStream<Uint8Array>> => {
  // Fold the legacy single-prompt shape into the current messages format so
  // older callsites keep working while they migrate.
  const request: AIChatRequest =
    "prompt" in data
      ? {
          messages: [{ role: "user", content: data.prompt }],
          provider: "openai",
          model: data.model,
          stream: true,
        }
      : { stream: true, ...data }
  return getStorage().ai.streamChat(request)
}

/** @deprecated Use `getAvailableAIProviders` and select a model from its `config` map. */
export const getAvailableAIModels = async () => {
  const providers = await getAvailableAIProviders()
  return Object.entries(providers.config).map(([provider, config]) => ({
    name: `${provider}:${config.default_model}`,
  }))
}

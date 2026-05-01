/** AI service — chat completion streaming and provider discovery. Thin
 *  wrappers around the Storage abstraction. */
import { getStorage } from "@/lib/storage"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface AIChatRequest {
  messages: ChatMessage[]
  /** Provider kind (e.g. "openai", "anthropic"). Used by the server-side
   *  dispatch path; ignored by the desktop path, which looks the kind up
   *  from the row identified by `providerId`. Kept for back-compat with
   *  the existing gateway schema. */
  provider?: string
  /** Stable id of a configured {@link AIProviderSettings} row. Required
   *  for the desktop BYO path; optional on the hosted web path, which
   *  falls back to `provider` + server-held keys. */
  providerId?: string
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
  options?: { signal?: AbortSignal },
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
  return getStorage().ai.streamChat(request, options)
}

/** @deprecated Use `getAvailableAIProviders` and select a model from its `config` map. */
export const getAvailableAIModels = async () => {
  const providers = await getAvailableAIProviders()
  return Object.entries(providers.config).map(([provider, config]) => ({
    name: `${provider}:${config.default_model}`,
  }))
}

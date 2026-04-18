/** AI service — chat completion streaming and provider discovery. */
import { apiClient, apiStreamClient } from "@/lib/api";

/** A single turn in an AI conversation. */
export interface ChatMessage {
  /** `"user"` for messages from the writer; `"assistant"` for AI responses. */
  role: "user" | "assistant";
  /** Text content of the message. */
  content: string;
}

/** Payload for initiating a chat completion request. */
export interface AIChatRequest {
  /** Ordered conversation history, oldest first. */
  messages: ChatMessage[];
  /** AI provider to use (e.g. `"openai"`, `"ollama"`, `"gemini"`). Defaults to `"ollama"`. */
  provider?: string;
  /** Model identifier to request from the provider (e.g. `"gpt-4o"`). */
  model?: string;
  /** Whether to stream the response as NDJSON chunks. Defaults to `true`. */
  stream?: boolean;
}

/**
 * Legacy request format retained for backward compatibility with older callsites.
 * @deprecated Use `AIChatRequest` with a `messages` array instead.
 */
export interface LegacyAIChatRequest {
  /** Single prompt string, converted to a `user` message internally. */
  prompt: string;
  /** Model identifier. */
  model: string;
}

/** Response from the providers discovery endpoint. */
export interface AIProvidersResponse {
  /** Names of configured AI providers (e.g. `["openai", "ollama"]`). */
  providers: string[];
  /** Per-provider configuration keyed by provider name. */
  config: Record<string, { default_model: string }>;
}

/**
 * Fetches the list of AI providers configured in the Python AI service and
 * their default model selections.
 *
 * @returns A promise that resolves to the available providers and their config.
 * @throws {Error} When the AI service is unreachable (HTTP 503).
 *
 * @example
 * ```ts
 * const { providers, config } = await getAvailableAIProviders();
 * console.log(config["openai"].default_model); // "gpt-4o"
 * ```
 */
export const getAvailableAIProviders = (): Promise<AIProvidersResponse> => {
  return apiClient<AIProvidersResponse>("api/ai/providers", {
    method: "GET",
  });
};

/**
 * Initiates a streaming chat completion request. The response arrives as
 * NDJSON chunks that should be read from the returned `ReadableStream` and
 * decoded line by line.
 *
 * Legacy `LegacyAIChatRequest` objects (with a `prompt` field) are
 * automatically converted to the new messages format before the request
 * is sent.
 *
 * @param data - Chat messages and optional provider/model overrides, or a
 *   legacy single-prompt request.
 * @returns A promise that resolves to a `ReadableStream<Uint8Array>` of NDJSON chunks.
 * @throws {Error} When the AI service is unreachable or returns a non-OK status.
 *
 * @example
 * ```ts
 * const stream = await streamChatCompletion({ messages: [{ role: "user", content: "Help me with act two." }] });
 * const reader = stream.getReader();
 * const decoder = new TextDecoder();
 * while (true) {
 *   const { done, value } = await reader.read();
 *   if (done) break;
 *   console.log(decoder.decode(value));
 * }
 * ```
 */
export const streamChatCompletion = (data: AIChatRequest | LegacyAIChatRequest): Promise<ReadableStream<Uint8Array>> => {
  let requestData: AIChatRequest;

  if ('prompt' in data) {
    requestData = {
      messages: [{ role: "user", content: data.prompt }],
      provider: "openai",
      model: data.model,
      stream: true
    };
  } else {
    requestData = {
      provider: "ollama",
      stream: true,
      ...data
    };
  }

  return apiStreamClient("api/ai/chat", {
    method: "POST",
    body: requestData,
  });
};

/**
 * Fetches available AI models in the legacy format used by older components.
 * Converts the providers response into a flat list of `"provider:model"` name strings.
 *
 * @returns A promise that resolves to an array of `{ name: string }` objects.
 * @deprecated Use `getAvailableAIProviders` and select a model from `config` directly.
 */
export const getAvailableAIModels = async () => {
  const providers = await getAvailableAIProviders();
  return Object.entries(providers.config).map(([provider, config]) => ({
    name: `${provider}:${config.default_model}`
  }));
};

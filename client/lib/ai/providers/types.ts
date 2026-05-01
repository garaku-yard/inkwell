/** Shared types for the AI provider adapter library. Each adapter
 *  normalizes its provider's native streaming format into a common
 *  `StreamChunk` stream so downstream code (chat panel, NDJSON proxies) can
 *  stay provider-agnostic. */

/** One turn in a chat. `system` messages carry top-of-conversation
 *  instructions; Anthropic and Gemini accept these only out-of-band, so
 *  their adapters hoist any `system`-role messages into the provider's
 *  dedicated field. */
export interface AdapterMessage {
  role: "system" | "user" | "assistant"
  content: string
}

/** One piece of a streaming completion. `delta` is the newly-arrived text
 *  since the previous chunk; callers concatenate deltas to rebuild the full
 *  response. `done` is set on the final chunk with an empty `delta`. */
export interface StreamChunk {
  /** Newly-arrived text. Empty string on the terminal chunk. */
  delta: string
  /** Set on the final chunk. Absent or `false` on all intermediate chunks. */
  done?: boolean
}

/** Discriminator for provider behavior. `openai_compatible` covers any
 *  endpoint speaking OpenAI's `/chat/completions` contract — Ollama,
 *  LM Studio, llama.cpp-server, OpenRouter, custom deployments. */
export type ProviderKind =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openai_compatible"

/** Input to every adapter's `streamChat`.
 *
 *  @property messages - Conversation history in chronological order.
 *  @property model - Provider-specific model identifier (e.g. `gpt-4o-mini`,
 *    `claude-3-5-sonnet-20241022`, `gemini-1.5-pro`, `llama3.2:3b`).
 *  @property apiKey - Optional for `openai_compatible` (local Ollama needs
 *    none), mandatory for hosted providers.
 *  @property baseUrl - Overrides the provider's public endpoint. Required
 *    for `openai_compatible`; ignored by Anthropic and Gemini.
 *  @property signal - AbortSignal used to cancel the underlying fetch and
 *    tear down the stream. */
export interface StreamChatInput {
  messages: AdapterMessage[]
  model: string
  apiKey?: string
  baseUrl?: string
  signal?: AbortSignal
}

/** A provider adapter. Adapters are pure — no internal state, safe to
 *  reuse across calls. Each `streamChat` call creates a fresh
 *  `ReadableStream` backed by a fresh `fetch`. */
export interface ProviderAdapter {
  readonly kind: ProviderKind
  /** Opens a streaming chat completion against the provider and returns a
   *  normalized chunk stream.
   *
   *  @throws {ProviderError} via `controller.error` on non-2xx HTTP,
   *    malformed stream payload, or explicit provider error events. Callers
   *    observe these via the reader's rejected read. */
  streamChat(input: StreamChatInput): ReadableStream<StreamChunk>
}

/** Error surface for adapter failures. `status` is the HTTP status when the
 *  failure came from the initial response; `null` when it came from the
 *  stream body, the network layer, or input validation. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderKind,
    readonly status: number | null,
  ) {
    super(message)
    this.name = "ProviderError"
  }
}

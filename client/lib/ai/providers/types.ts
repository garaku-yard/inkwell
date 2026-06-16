/** Shared types for the AI provider adapter library. Each adapter
 *  normalizes its provider's native streaming format into a common
 *  `StreamChunk` stream so downstream code (chat panel, NDJSON proxies) can
 *  stay provider-agnostic. */

/** One tool call the model asked to make. `args` is the JSON-encoded
 *  arguments object, possibly reassembled from streamed fragments. `id`
 *  ties a later tool-result turn back to this call (synthesised from the
 *  tool name for providers like Gemini that don't issue ids). */
export interface AdapterToolCall {
  id: string
  name: string
  args: string
}

/** One turn in a chat. `system` messages carry top-of-conversation
 *  instructions; Anthropic and Gemini accept these only out-of-band, so
 *  their adapters hoist any `system`-role messages into the provider's
 *  dedicated field.
 *
 *  The `tool` role plus `toolCalls`/`toolCallId` carry a function-calling
 *  round-trip: an `assistant` turn may include the `toolCalls` it requested,
 *  and a following `tool` turn carries one call's result (`content`) tagged
 *  with the originating `toolCallId` and tool `name`. Each adapter re-encodes
 *  these into its provider's native tool-message shape. */
export interface AdapterMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  /** Tool calls requested on an `assistant` turn. */
  toolCalls?: AdapterToolCall[]
  /** On a `tool` turn, the id of the call this result answers. */
  toolCallId?: string
  /** On a `tool` turn, the name of the tool that produced the result. */
  name?: string
}

/** A tool the model may call. `parameters` is a JSON Schema object describing
 *  the call's arguments. Each adapter maps this into its provider's native
 *  tool / function declaration. */
export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** One piece of a streaming completion. `delta` is the newly-arrived text
 *  since the previous chunk; callers concatenate deltas to rebuild the full
 *  response. `done` is set on the final chunk with an empty `delta`. */
export interface StreamChunk {
  /** Newly-arrived text. Empty string on the terminal chunk. */
  delta: string
  /** Set on the final chunk. Absent or `false` on all intermediate chunks. */
  done?: boolean
  /** Present when the model emitted a complete tool call this turn. The
   *  orchestrator executes it and continues the conversation. */
  toolCall?: AdapterToolCall
  /** Why the turn ended, set on the terminal chunk. `"tool_use"` means one
   *  or more `toolCall`s are pending and the caller should run them and send
   *  the results back; `"stop"` means the model finished normally. */
  stopReason?: "stop" | "tool_use"
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
  /** Tools to offer the model. When omitted, the request carries no tool
   *  declarations and behaves exactly as before. */
  tools?: ToolSpec[]
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

/** Entry point for the AI provider adapter library.
 *
 *  Each provider has one adapter that normalizes its native streaming
 *  format to a common `StreamChunk` stream. Call `getAdapter(kind)` to get
 *  the right implementation, then `adapter.streamChat(input)` to start a
 *  completion. Adapters are stateless and safe to reuse.
 *
 *  The library is pure TypeScript with no dependency on the Storage
 *  abstraction — it can be called directly from both the desktop build
 *  (where keys come from the OS keychain) and the web build's local-model
 *  path (where the base URL points at the user's own Ollama). Web hosted
 *  providers (OpenAI/Anthropic/Gemini with server-held keys) go through
 *  the gateway and the Python AI service and never call this library. */

import { createAnthropicAdapter } from "./anthropic"
import { createGeminiAdapter } from "./gemini"
import { createOpenAIAdapter } from "./openai"
import type { ProviderAdapter, ProviderKind } from "./types"

const adapters: Record<ProviderKind, ProviderAdapter> = {
  openai: createOpenAIAdapter("openai"),
  openai_compatible: createOpenAIAdapter("openai_compatible"),
  anthropic: createAnthropicAdapter(),
  gemini: createGeminiAdapter(),
}

/** Returns the adapter for a given provider kind. Adapters are cached —
 *  every call for the same kind returns the same instance. */
export function getAdapter(kind: ProviderKind): ProviderAdapter {
  return adapters[kind]
}

export type {
  AdapterMessage,
  ProviderAdapter,
  ProviderKind,
  StreamChatInput,
  StreamChunk,
} from "./types"
export { ProviderError } from "./types"

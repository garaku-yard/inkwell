/** AI service — chat completion streaming. Thin wrapper around the
 *  Storage abstraction; every storage impl handles dispatch (desktop:
 *  via the keychain-backed adapter library, web: via the gateway's BYO
 *  endpoint). Provider discovery is no longer a separate API — the user
 *  picks from rows they configured under Settings → AI Providers. */
import { getStorage } from "@/lib/storage"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface AIChatRequest {
  messages: ChatMessage[]
  /** Stable id of a configured AI provider row. Required — every chat
   *  request dispatches through one of the user's BYO providers. */
  providerId: string
  model?: string
  stream?: boolean
}

export const streamChatCompletion = (
  data: AIChatRequest,
  options?: { signal?: AbortSignal },
): Promise<ReadableStream<Uint8Array>> =>
  getStorage().ai.streamChat({ stream: true, ...data }, options)

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
  /** The project this chat belongs to. When the project has vault-as-knowledge
   *  scopes wired, the desktop storage layer retrieves relevant note chunks
   *  into the prompt and offers the `read_note` tool. Ignored on the web
   *  build (no local vault). */
  projectId?: string
}

export const streamChatCompletion = (
  data: AIChatRequest,
  options?: { signal?: AbortSignal },
): Promise<ReadableStream<Uint8Array>> =>
  getStorage().ai.streamChat({ stream: true, ...data }, options)

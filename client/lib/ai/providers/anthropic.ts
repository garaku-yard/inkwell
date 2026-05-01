import { parseSSE } from "./sse"
import type {
  AdapterMessage,
  ProviderAdapter,
  StreamChatInput,
  StreamChunk,
} from "./types"
import { ProviderError } from "./types"

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"
const ANTHROPIC_API_VERSION = "2023-06-01"
const DEFAULT_MAX_TOKENS = 4096

interface AnthropicContentDelta {
  type?: string
  delta?: { type?: string; text?: string }
}

interface AnthropicError {
  error?: { message?: string; type?: string }
}

/** Creates an adapter for Anthropic's Messages API (`POST /v1/messages`).
 *
 *  Anthropic doesn't accept `role: "system"` inside the `messages` array —
 *  system prompts are a separate top-level `system` field. This adapter
 *  hoists all `system`-role entries out of the message list and joins them
 *  with blank lines before sending.
 *
 *  Browser-origin requests require the
 *  `anthropic-dangerous-direct-browser-access` header; without it Anthropic
 *  rejects the preflight. This is safe here because the key is either the
 *  user's own (desktop BYO) or fetched server-side (web BYO path routes
 *  through the gateway and doesn't use this adapter). */
export function createAnthropicAdapter(): ProviderAdapter {
  return {
    kind: "anthropic",
    streamChat(input: StreamChatInput): ReadableStream<StreamChunk> {
      if (!input.apiKey) {
        return errorStream(
          new ProviderError("Anthropic requires an API key", "anthropic", null),
        )
      }

      const { system, conversation } = splitSystem(input.messages)
      const body: Record<string, unknown> = {
        model: input.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        messages: conversation,
        stream: true,
      }
      if (system) body.system = system

      return new ReadableStream<StreamChunk>({
        async start(controller) {
          let response: Response
          try {
            response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": input.apiKey!,
                "anthropic-version": ANTHROPIC_API_VERSION,
                "anthropic-dangerous-direct-browser-access": "true",
              },
              body: JSON.stringify(body),
              signal: input.signal,
            })
          } catch (err) {
            controller.error(
              new ProviderError((err as Error).message, "anthropic", null),
            )
            return
          }

          if (!response.ok || !response.body) {
            const text = await response.text().catch(() => "")
            controller.error(
              new ProviderError(
                text || response.statusText || "request failed",
                "anthropic",
                response.status,
              ),
            )
            return
          }

          try {
            for await (const ev of parseSSE(response.body)) {
              if (ev.event === "content_block_delta") {
                const json = JSON.parse(ev.data) as AnthropicContentDelta
                const delta = json.delta?.text
                if (typeof delta === "string" && delta.length > 0) {
                  controller.enqueue({ delta })
                }
              } else if (ev.event === "message_stop") {
                controller.enqueue({ delta: "", done: true })
              } else if (ev.event === "error") {
                const json = JSON.parse(ev.data) as AnthropicError
                throw new ProviderError(
                  json.error?.message ?? "unknown stream error",
                  "anthropic",
                  null,
                )
              }
            }
            controller.close()
          } catch (err) {
            controller.error(
              err instanceof ProviderError
                ? err
                : new ProviderError((err as Error).message, "anthropic", null),
            )
          }
        },
      })
    },
  }
}

function splitSystem(messages: AdapterMessage[]): {
  system: string | null
  conversation: AdapterMessage[]
} {
  const systems: string[] = []
  const conversation: AdapterMessage[] = []
  for (const m of messages) {
    if (m.role === "system") systems.push(m.content)
    else conversation.push(m)
  }
  return {
    system: systems.length === 0 ? null : systems.join("\n\n"),
    conversation,
  }
}

function errorStream(error: ProviderError): ReadableStream<StreamChunk> {
  return new ReadableStream<StreamChunk>({
    start(controller) {
      controller.error(error)
    },
  })
}

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
  index?: number
  content_block?: { type?: string; id?: string; name?: string }
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string }
}

interface AnthropicError {
  error?: { message?: string; type?: string }
}

/** An Anthropic message — `content` is either a plain string (normal turn)
 *  or an array of typed content blocks (tool_use / tool_result turns). */
interface AnthropicMessage {
  role: "user" | "assistant"
  content: string | Array<Record<string, unknown>>
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
        messages: buildAnthropicMessages(conversation),
        stream: true,
      }
      if (system) body.system = system
      if (input.tools?.length) {
        body.tools = input.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }))
      }

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
            // Tool calls arrive as their own content blocks: a
            // `content_block_start` of type `tool_use` (carrying id + name),
            // then `input_json_delta` fragments we accumulate by block index,
            // closed by `content_block_stop`. The overall `stop_reason`
            // (`tool_use` vs `end_turn`) lands in `message_delta`.
            const toolBlocks = new Map<number, { id: string; name: string; json: string }>()
            let stopReason: "stop" | "tool_use" = "stop"
            for await (const ev of parseSSE(response.body)) {
              if (ev.event === "content_block_start") {
                const json = JSON.parse(ev.data) as AnthropicContentDelta
                if (json.content_block?.type === "tool_use" && json.index != null) {
                  toolBlocks.set(json.index, {
                    id: json.content_block.id ?? "",
                    name: json.content_block.name ?? "",
                    json: "",
                  })
                }
              } else if (ev.event === "content_block_delta") {
                const json = JSON.parse(ev.data) as AnthropicContentDelta
                if (json.delta?.type === "input_json_delta" && json.index != null) {
                  const block = toolBlocks.get(json.index)
                  if (block) block.json += json.delta.partial_json ?? ""
                } else {
                  const delta = json.delta?.text
                  if (typeof delta === "string" && delta.length > 0) {
                    controller.enqueue({ delta })
                  }
                }
              } else if (ev.event === "content_block_stop") {
                const json = JSON.parse(ev.data) as AnthropicContentDelta
                if (json.index != null) {
                  const block = toolBlocks.get(json.index)
                  if (block) {
                    controller.enqueue({
                      delta: "",
                      toolCall: { id: block.id, name: block.name, args: block.json || "{}" },
                    })
                    toolBlocks.delete(json.index)
                  }
                }
              } else if (ev.event === "message_delta") {
                const json = JSON.parse(ev.data) as AnthropicContentDelta
                if (json.delta?.stop_reason === "tool_use") stopReason = "tool_use"
              } else if (ev.event === "message_stop") {
                controller.enqueue({ delta: "", done: true, stopReason })
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

/** Encodes adapter messages into Anthropic's message shape. Plain turns keep
 *  string content; an assistant turn carrying `toolCalls` becomes a content
 *  array of optional text + `tool_use` blocks, and a `tool` turn becomes a
 *  `user` message with a `tool_result` block referencing the call id. */
function buildAnthropicMessages(conversation: AdapterMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  for (const m of conversation) {
    if (m.role === "tool") {
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId ?? "",
            content: m.content,
          },
        ],
      })
      continue
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const blocks: Array<Record<string, unknown>> = []
      if (m.content.trim()) blocks.push({ type: "text", text: m.content })
      for (const call of m.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: safeParseObject(call.args),
        })
      }
      out.push({ role: "assistant", content: blocks })
      continue
    }
    // Plain user/assistant turn.
    out.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })
  }
  return out
}

/** Parses a tool-call argument string into an object, defaulting to `{}` so a
 *  malformed or empty payload can't crash the request body. */
function safeParseObject(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json || "{}")
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function errorStream(error: ProviderError): ReadableStream<StreamChunk> {
  return new ReadableStream<StreamChunk>({
    start(controller) {
      controller.error(error)
    },
  })
}

import { parseSSE } from "./sse"
import type {
  AdapterMessage,
  ProviderAdapter,
  ProviderKind,
  StreamChatInput,
  StreamChunk,
} from "./types"
import { ProviderError } from "./types"

const OPENAI_PUBLIC_BASE_URL = "https://api.openai.com/v1"

interface OpenAIToolCallDelta {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; tool_calls?: OpenAIToolCallDelta[] }
    finish_reason?: string | null
  }>
  error?: { message?: string }
}

/** Creates an adapter for OpenAI's `/chat/completions` streaming contract.
 *
 *  The same adapter covers any OpenAI-compatible endpoint (Ollama, LM
 *  Studio, llama.cpp-server, OpenRouter, custom deployments) when the
 *  caller passes a `baseUrl`. For `kind: "openai_compatible"`, `baseUrl`
 *  is required; omitting it surfaces a `ProviderError` rather than
 *  silently hitting OpenAI's public API with a wrong key.
 *
 *  The returned adapter is stateless — it can be reused across calls. */
export function createOpenAIAdapter(
  kind: Extract<ProviderKind, "openai" | "openai_compatible"> = "openai",
): ProviderAdapter {
  return {
    kind,
    streamChat(input: StreamChatInput): ReadableStream<StreamChunk> {
      if (kind === "openai_compatible" && !input.baseUrl) {
        return errorStream(
          new ProviderError(
            "openai_compatible requires a baseUrl",
            kind,
            null,
          ),
        )
      }

      const baseUrl = (input.baseUrl ?? OPENAI_PUBLIC_BASE_URL).replace(
        /\/+$/,
        "",
      )
      const url = `${baseUrl}/chat/completions`

      const headers: Record<string, string> = {
        "content-type": "application/json",
      }
      if (input.apiKey) headers["authorization"] = `Bearer ${input.apiKey}`

      return new ReadableStream<StreamChunk>({
        async start(controller) {
          let response: Response
          try {
            response = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify({
                model: input.model,
                messages: buildOpenAIMessages(input.messages),
                stream: true,
                ...(input.tools?.length
                  ? {
                      tools: input.tools.map((t) => ({
                        type: "function",
                        function: {
                          name: t.name,
                          description: t.description,
                          parameters: t.parameters,
                        },
                      })),
                    }
                  : {}),
              }),
              signal: input.signal,
            })
          } catch (err) {
            controller.error(
              new ProviderError((err as Error).message, kind, null),
            )
            return
          }

          if (!response.ok || !response.body) {
            const text = await response.text().catch(() => "")
            controller.error(
              new ProviderError(
                text || response.statusText || "request failed",
                kind,
                response.status,
              ),
            )
            return
          }

          try {
            // Tool calls stream as `delta.tool_calls` fragments: the first
            // fragment for a given `index` carries the id + name, later ones
            // append `arguments` string pieces. `finish_reason === "tool_calls"`
            // signals the calls are complete and ready to flush.
            const toolAccum = new Map<number, { id: string; name: string; args: string }>()
            let stopReason: "stop" | "tool_use" = "stop"
            for await (const ev of parseSSE(response.body)) {
              if (ev.data === "[DONE]") {
                controller.enqueue({ delta: "", done: true, stopReason })
                continue
              }
              const json = JSON.parse(ev.data) as OpenAIStreamChunk
              if (json.error?.message) {
                throw new ProviderError(json.error.message, kind, null)
              }
              const choice = json.choices?.[0]
              const delta = choice?.delta?.content
              if (typeof delta === "string" && delta.length > 0) {
                controller.enqueue({ delta })
              }
              for (const tc of choice?.delta?.tool_calls ?? []) {
                const idx = tc.index ?? 0
                let acc = toolAccum.get(idx)
                if (!acc) {
                  acc = { id: "", name: "", args: "" }
                  toolAccum.set(idx, acc)
                }
                if (tc.id) acc.id = tc.id
                if (tc.function?.name) acc.name = tc.function.name
                if (tc.function?.arguments) acc.args += tc.function.arguments
              }
              if (choice?.finish_reason === "tool_calls") {
                stopReason = "tool_use"
                for (const call of toolAccum.values()) {
                  controller.enqueue({
                    delta: "",
                    toolCall: { id: call.id, name: call.name, args: call.args || "{}" },
                  })
                }
                toolAccum.clear()
              }
            }
            controller.close()
          } catch (err) {
            controller.error(
              err instanceof ProviderError
                ? err
                : new ProviderError((err as Error).message, kind, null),
            )
          }
        },
      })
    },
  }
}

/** Encodes adapter messages into OpenAI's chat message shape. Plain turns
 *  pass through as `{role, content}`; an assistant turn with `toolCalls`
 *  becomes `{role:"assistant", content, tool_calls:[...]}`; a `tool` turn
 *  becomes `{role:"tool", tool_call_id, content}`. */
function buildOpenAIMessages(messages: AdapterMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId ?? "", content: m.content }
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.args || "{}" },
        })),
      }
    }
    return { role: m.role, content: m.content }
  })
}

function errorStream(error: ProviderError): ReadableStream<StreamChunk> {
  return new ReadableStream<StreamChunk>({
    start(controller) {
      controller.error(error)
    },
  })
}

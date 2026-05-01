import { parseSSE } from "./sse"
import type {
  AdapterMessage,
  ProviderAdapter,
  StreamChatInput,
  StreamChunk,
} from "./types"
import { ProviderError } from "./types"

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

interface GeminiPart {
  text?: string
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] }
  finishReason?: string
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[]
  error?: { message?: string }
}

interface GeminiContent {
  role: "user" | "model"
  parts: Array<{ text: string }>
}

/** Creates an adapter for Google Gemini's `streamGenerateContent` endpoint.
 *
 *  Gemini's wire format differs from OpenAI's in three ways: the assistant
 *  role is named `model`, messages are nested as
 *  `{role, parts: [{text}]}`, and system prompts live in a separate
 *  top-level `systemInstruction` field. This adapter reshapes the input
 *  accordingly.
 *
 *  The API key is passed as a `?key=…` query parameter rather than a
 *  header — that's the official auth scheme for the public AI Studio
 *  endpoint. */
export function createGeminiAdapter(): ProviderAdapter {
  return {
    kind: "gemini",
    streamChat(input: StreamChatInput): ReadableStream<StreamChunk> {
      if (!input.apiKey) {
        return errorStream(
          new ProviderError("Gemini requires an API key", "gemini", null),
        )
      }

      const { systemInstruction, contents } = buildContents(input.messages)
      const url =
        `${GEMINI_BASE_URL}/models/${encodeURIComponent(input.model)}` +
        `:streamGenerateContent?alt=sse&key=${encodeURIComponent(input.apiKey)}`

      const body: Record<string, unknown> = { contents }
      if (systemInstruction) body.systemInstruction = systemInstruction

      return new ReadableStream<StreamChunk>({
        async start(controller) {
          let response: Response
          try {
            response = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
              signal: input.signal,
            })
          } catch (err) {
            controller.error(
              new ProviderError((err as Error).message, "gemini", null),
            )
            return
          }

          if (!response.ok || !response.body) {
            const text = await response.text().catch(() => "")
            controller.error(
              new ProviderError(
                text || response.statusText || "request failed",
                "gemini",
                response.status,
              ),
            )
            return
          }

          try {
            let finished = false
            for await (const ev of parseSSE(response.body)) {
              const json = JSON.parse(ev.data) as GeminiStreamChunk
              if (json.error?.message) {
                throw new ProviderError(json.error.message, "gemini", null)
              }
              const parts = json.candidates?.[0]?.content?.parts
              if (Array.isArray(parts)) {
                for (const part of parts) {
                  if (typeof part.text === "string" && part.text.length > 0) {
                    controller.enqueue({ delta: part.text })
                  }
                }
              }
              if (json.candidates?.[0]?.finishReason && !finished) {
                controller.enqueue({ delta: "", done: true })
                finished = true
              }
            }
            controller.close()
          } catch (err) {
            controller.error(
              err instanceof ProviderError
                ? err
                : new ProviderError((err as Error).message, "gemini", null),
            )
          }
        },
      })
    },
  }
}

function buildContents(messages: AdapterMessage[]): {
  systemInstruction: { parts: Array<{ text: string }> } | null
  contents: GeminiContent[]
} {
  const systems: string[] = []
  const contents: GeminiContent[] = []
  for (const m of messages) {
    if (m.role === "system") {
      systems.push(m.content)
    } else {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })
    }
  }
  const systemInstruction =
    systems.length === 0
      ? null
      : { parts: [{ text: systems.join("\n\n") }] }
  return { systemInstruction, contents }
}

function errorStream(error: ProviderError): ReadableStream<StreamChunk> {
  return new ReadableStream<StreamChunk>({
    start(controller) {
      controller.error(error)
    },
  })
}

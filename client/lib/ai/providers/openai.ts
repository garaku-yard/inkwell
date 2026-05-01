import { parseSSE } from "./sse"
import type {
  ProviderAdapter,
  ProviderKind,
  StreamChatInput,
  StreamChunk,
} from "./types"
import { ProviderError } from "./types"

const OPENAI_PUBLIC_BASE_URL = "https://api.openai.com/v1"

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null }
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
                messages: input.messages,
                stream: true,
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
            for await (const ev of parseSSE(response.body)) {
              if (ev.data === "[DONE]") {
                controller.enqueue({ delta: "", done: true })
                continue
              }
              const json = JSON.parse(ev.data) as OpenAIStreamChunk
              if (json.error?.message) {
                throw new ProviderError(json.error.message, kind, null)
              }
              const delta = json.choices?.[0]?.delta?.content
              if (typeof delta === "string" && delta.length > 0) {
                controller.enqueue({ delta })
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

function errorStream(error: ProviderError): ReadableStream<StreamChunk> {
  return new ReadableStream<StreamChunk>({
    start(controller) {
      controller.error(error)
    },
  })
}

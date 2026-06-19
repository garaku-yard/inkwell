import { afterEach, describe, expect, it, vi } from "vitest"

import { createAnthropicAdapter } from "@/lib/ai/providers/anthropic"
import { createOpenAIAdapter } from "@/lib/ai/providers/openai"
import { createGeminiAdapter } from "@/lib/ai/providers/gemini"
import type { StreamChunk } from "@/lib/ai/providers/types"

// ─── Helpers ────────────────────────────────────────────────────────────────

/** A ReadableStream of `text` as UTF-8 bytes. When chunkSize is set the bytes
 *  are emitted in chunkSize-byte pieces, which deliberately splits SSE lines
 *  across reads to exercise the parser's cross-read buffering. */
function sseStream(text: string, chunkSize?: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (!chunkSize) {
        controller.enqueue(bytes)
      } else {
        for (let i = 0; i < bytes.length; i += chunkSize) {
          controller.enqueue(bytes.slice(i, i + chunkSize))
        }
      }
      controller.close()
    },
  })
}

/** Stubs global fetch to return one SSE response. */
function mockSSE(text: string, opts: { chunkSize?: number; ok?: boolean; status?: number } = {}) {
  const resp = {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: "OK",
    body: sseStream(text, opts.chunkSize),
    text: async () => "",
  }
  vi.stubGlobal("fetch", vi.fn(async () => resp as unknown as Response))
}

/** Drains a StreamChunk stream into an array. */
async function collect(stream: ReadableStream<StreamChunk>): Promise<StreamChunk[]> {
  const reader = stream.getReader()
  const out: StreamChunk[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    out.push(value)
  }
  return out
}

const userMsg = { messages: [{ role: "user" as const, content: "hi" }], model: "m", apiKey: "k" }

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Anthropic ────────────────────────────────────────────────────────────────

describe("anthropic adapter — SSE parsing", () => {
  it("streams text deltas and a terminal stop chunk", async () => {
    mockSSE(
      `event: content_block_start\ndata: {"index":0,"content_block":{"type":"text"}}\n\n` +
        `event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n` +
        `event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":" world"}}\n\n` +
        `event: content_block_stop\ndata: {"index":0}\n\n` +
        `event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}\n\n` +
        `event: message_stop\ndata: {}\n\n`,
    )
    const chunks = await collect(createAnthropicAdapter().streamChat(userMsg))
    expect(chunks.map((c) => c.delta).join("")).toBe("Hello world")
    const last = chunks[chunks.length - 1]
    expect(last).toMatchObject({ delta: "", done: true, stopReason: "stop" })
  })

  it("assembles a tool call from input_json_delta fragments", async () => {
    mockSSE(
      `event: content_block_start\ndata: {"index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_note"}}\n\n` +
        `event: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"title\\":"}}\n\n` +
        `event: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"\\"Cats\\"}"}}\n\n` +
        `event: content_block_stop\ndata: {"index":0}\n\n` +
        `event: message_delta\ndata: {"delta":{"stop_reason":"tool_use"}}\n\n` +
        `event: message_stop\ndata: {}\n\n`,
    )
    const chunks = await collect(createAnthropicAdapter().streamChat(userMsg))
    const tool = chunks.find((c) => c.toolCall)?.toolCall
    expect(tool).toEqual({ id: "toolu_1", name: "read_note", args: '{"title":"Cats"}' })
    expect(chunks[chunks.length - 1]).toMatchObject({ done: true, stopReason: "tool_use" })
  })

  it("parses identically when bytes are split mid-line (cross-read buffering)", async () => {
    const body =
      `event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"split me"}}\n\n` +
      `event: message_stop\ndata: {}\n\n`
    mockSSE(body, { chunkSize: 1 })
    const chunks = await collect(createAnthropicAdapter().streamChat(userMsg))
    expect(chunks.map((c) => c.delta).join("")).toBe("split me")
    expect(chunks[chunks.length - 1]).toMatchObject({ done: true })
  })

  it("rejects on an error event", async () => {
    mockSSE(`event: error\ndata: {"error":{"message":"overloaded"}}\n\n`)
    await expect(collect(createAnthropicAdapter().streamChat(userMsg))).rejects.toThrow("overloaded")
  })

  it("rejects on a non-2xx response", async () => {
    mockSSE("", { ok: false, status: 401 })
    await expect(collect(createAnthropicAdapter().streamChat(userMsg))).rejects.toBeTruthy()
  })
})

// ─── OpenAI ───────────────────────────────────────────────────────────────────

describe("openai adapter — SSE parsing", () => {
  it("streams content deltas and finishes on [DONE]", async () => {
    mockSSE(
      `data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n` +
        `data: {"choices":[{"delta":{"content":" world"}}]}\n\n` +
        `data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n` +
        `data: [DONE]\n\n`,
    )
    const chunks = await collect(createOpenAIAdapter().streamChat(userMsg))
    expect(chunks.map((c) => c.delta).join("")).toBe("Hello world")
    expect(chunks[chunks.length - 1]).toMatchObject({ delta: "", done: true, stopReason: "stop" })
  })

  it("assembles a tool call from streamed argument fragments", async () => {
    mockSSE(
      `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_note","arguments":"{\\"title\\":"}}]}}]}\n\n` +
        `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Cats\\"}"}}]}}]}\n\n` +
        `data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n` +
        `data: [DONE]\n\n`,
    )
    const chunks = await collect(createOpenAIAdapter().streamChat(userMsg))
    const tool = chunks.find((c) => c.toolCall)?.toolCall
    expect(tool).toEqual({ id: "call_1", name: "read_note", args: '{"title":"Cats"}' })
    expect(chunks[chunks.length - 1]).toMatchObject({ done: true, stopReason: "tool_use" })
  })
})

// ─── Gemini ───────────────────────────────────────────────────────────────────

describe("gemini adapter — SSE parsing", () => {
  it("streams text parts and a terminal stop chunk", async () => {
    mockSSE(
      `data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n` +
        `data: {"candidates":[{"content":{"parts":[{"text":" world"}]},"finishReason":"STOP"}]}\n\n`,
    )
    const chunks = await collect(createGeminiAdapter().streamChat(userMsg))
    expect(chunks.map((c) => c.delta).join("")).toBe("Hello world")
    expect(chunks[chunks.length - 1]).toMatchObject({ delta: "", done: true, stopReason: "stop" })
  })

  it("emits a functionCall part as a complete tool call", async () => {
    mockSSE(
      `data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"read_note","args":{"title":"Cats"}}}]},"finishReason":"STOP"}]}\n\n`,
    )
    const chunks = await collect(createGeminiAdapter().streamChat(userMsg))
    const tool = chunks.find((c) => c.toolCall)?.toolCall
    expect(tool).toEqual({ id: "read_note", name: "read_note", args: '{"title":"Cats"}' })
    expect(chunks[chunks.length - 1]).toMatchObject({ done: true, stopReason: "tool_use" })
  })
})

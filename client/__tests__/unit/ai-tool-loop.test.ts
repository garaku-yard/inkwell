import { describe, expect, it, vi, beforeEach } from "vitest"

import type { StreamChunk } from "@/lib/ai/providers"

// Shared spies/state, hoisted so the vi.mock factories below can close over them.
const h = vi.hoisted(() => ({
  adapterCalls: 0,
  lastMessages: [] as unknown[],
  readNoteSpy: vi.fn(async () => ({
    title: "Cats",
    filename: "Cats.md",
    content: "Cats are independent and warm.",
  })),
}))

function streamOf(chunks: StreamChunk[]): ReadableStream<StreamChunk> {
  return new ReadableStream<StreamChunk>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
}

// A scripted adapter: first turn asks to call read_note, second turn answers.
vi.mock("@/lib/ai/providers", () => ({
  getAdapter: () => ({
    kind: "openai",
    streamChat(input: { messages: unknown[] }) {
      h.adapterCalls += 1
      h.lastMessages = input.messages
      if (h.adapterCalls === 1) {
        return streamOf([
          { delta: "Let me check your notes. " },
          { delta: "", toolCall: { id: "t1", name: "read_note", args: '{"title":"Cats"}' } },
          { delta: "", done: true, stopReason: "tool_use" },
        ])
      }
      return streamOf([
        { delta: "Your notes say cats are independent." },
        { delta: "", done: true, stopReason: "stop" },
      ])
    },
  }),
}))

vi.mock("@/lib/secrets", () => ({
  getSecret: async () => "sk-test",
  setSecret: async () => {},
  deleteSecret: async () => {},
}))

vi.mock("@/lib/storage/local/shared", () => ({
  newId: () => "new-id",
  getDb: async () => ({
    select: async () => [
      {
        id: "p1",
        kind: "openai",
        label: "Test",
        enabled: 1,
        base_url: null,
        default_model: "gpt-4o",
        key_version: 1,
        created_at: 0,
        updated_at: 0,
      },
    ],
    execute: async () => ({ rowsAffected: 1 }),
  }),
}))

vi.mock("@/lib/storage/local/knowledge", () => ({
  knowledge: {
    hasScopes: async () => true,
    retrieve: async () => [
      { vaultProjectId: "v1", filename: "Cats.md", title: "Cats", text: "cats excerpt", score: 0.9 },
    ],
    readNoteForTool: h.readNoteSpy,
  },
}))

import { ai } from "@/lib/storage/local/ai"

async function drain(stream: ReadableStream<Uint8Array>): Promise<Array<Record<string, unknown>>> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const lines: Array<Record<string, unknown>> = []
  let buffer = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value)
    let nl: number
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) lines.push(JSON.parse(line))
    }
  }
  return lines
}

describe("ai.streamChat — knowledge tool loop", () => {
  beforeEach(() => {
    h.adapterCalls = 0
    h.readNoteSpy.mockClear()
  })

  it("runs read_note, feeds the result back, and continues to a final answer", async () => {
    const stream = await ai.streamChat({
      providerId: "p1",
      projectId: "proj1",
      messages: [{ role: "user", content: "Tell me about cats" }],
    })
    const lines = await drain(stream)

    // Two adapter turns: the tool call, then the grounded answer.
    expect(h.adapterCalls).toBe(2)
    // The tool was executed against the consuming project, scoped.
    expect(h.readNoteSpy).toHaveBeenCalledWith("proj1", "Cats")

    // The NDJSON carries: turn-1 text, the tool aside, turn-2 text, done.
    const responses = lines.filter((l) => "response" in l).map((l) => l.response)
    expect(responses.join("")).toContain("Let me check your notes.")
    expect(responses.join("")).toContain("cats are independent")

    const toolLine = lines.find((l) => l.tool === "read_note")
    expect(toolLine).toEqual({ tool: "read_note", arg: "Cats" })

    expect(lines.some((l) => l.done === true)).toBe(true)

    // Turn 2's messages must include the assistant tool-call turn and the
    // tool-result turn so the model can answer from the note.
    const roles = (h.lastMessages as Array<{ role: string }>).map((m) => m.role)
    expect(roles).toContain("tool")
  })
})

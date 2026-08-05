import { describe, expect, it, vi, beforeEach } from "vitest"

import type { StreamChunk } from "@/lib/ai/providers"

// Shared spies/state, hoisted so the vi.mock factories below can close over them.
const h = vi.hoisted(() => ({
  adapterCalls: 0,
  lastMessages: [] as unknown[],
  lastTools: [] as Array<{ name: string }>,
  /** One scripted adapter turn per entry, consumed in order. */
  turns: [] as unknown[][],
  hasScopes: vi.fn(async () => true),
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

// A scripted adapter: it replays h.turns, one entry per call, and records
// what it was offered so tests can assert on the declared tools.
vi.mock("@/lib/ai/providers", () => ({
  getAdapter: () => ({
    kind: "openai",
    streamChat(input: { messages: unknown[]; tools?: Array<{ name: string }> }) {
      h.lastMessages = input.messages
      h.lastTools = input.tools ?? []
      const turn = h.turns[h.adapterCalls] ?? [{ delta: "", done: true, stopReason: "stop" }]
      h.adapterCalls += 1
      return streamOf(turn as StreamChunk[])
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
  LOCAL_USER_ID: "local-user",
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

// list_scenes runs for real in the no-knowledge case; give it a project.
vi.mock("@/lib/storage/local/scenes", () => ({
  scenes: { listForProject: async () => [] },
}))

vi.mock("@/lib/storage/local/knowledge", () => ({
  knowledge: {
    hasScopes: h.hasScopes,
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
    h.lastTools = []
    h.readNoteSpy.mockClear()
    h.hasScopes.mockClear()
    h.hasScopes.mockResolvedValue(true)
    // Turn 1 asks to call read_note; turn 2 answers from the result.
    h.turns = [
      [
        { delta: "Let me check your notes. " },
        { delta: "", toolCall: { id: "t1", name: "read_note", args: '{"title":"Cats"}' } },
        { delta: "", done: true, stopReason: "tool_use" },
      ],
      [
        { delta: "Your notes say cats are independent." },
        { delta: "", done: true, stopReason: "stop" },
      ],
    ]
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

    // The aside carries the tool's own wording, not a verb the panel guessed.
    const toolLine = lines.find((l) => l.tool === "read_note")
    expect(toolLine).toEqual({ tool: "read_note", label: 'Reading "Cats"' })

    expect(lines.some((l) => l.done === true)).toBe(true)

    // Turn 2's messages must include the assistant tool-call turn and the
    // tool-result turn so the model can answer from the note.
    const roles = (h.lastMessages as Array<{ role: string }>).map((m) => m.role)
    expect(roles).toContain("tool")
  })

  it("offers the note tools only when the project has knowledge wired", async () => {
    h.turns = [[{ delta: "Hello.", done: false }, { delta: "", done: true, stopReason: "stop" }]]
    await drain(
      await ai.streamChat({
        providerId: "p1",
        projectId: "proj1",
        messages: [{ role: "user", content: "hi" }],
      }),
    )
    expect(h.lastTools.map((t) => t.name)).toContain("read_note")
  })

  it("still runs the loop for a project with no notes wired, minus the note tools", async () => {
    h.hasScopes.mockResolvedValue(false)
    h.turns = [
      [
        { delta: "", toolCall: { id: "t1", name: "list_scenes", args: "{}" } },
        { delta: "", done: true, stopReason: "tool_use" },
      ],
      [{ delta: "You have no scenes." }, { delta: "", done: true, stopReason: "stop" }],
    ]

    const lines = await drain(
      await ai.streamChat({
        providerId: "p1",
        projectId: "proj1",
        messages: [{ role: "user", content: "what scenes do I have?" }],
      }),
    )

    // The manuscript tools are there; the note ones aren't offered at all.
    const offered = h.lastTools.map((t) => t.name)
    expect(offered).toEqual(["list_projects", "list_scenes", "read_scene"])
    expect(h.readNoteSpy).not.toHaveBeenCalled()

    // And the loop ran: the call executed and the aside carries its wording.
    expect(lines.find((l) => l.tool === "list_scenes")).toEqual({
      tool: "list_scenes",
      label: "Listing scenes",
    })
    expect(h.adapterCalls).toBe(2)

    // No retrieval happened either, so nothing was prepended to the chat.
    const roles = (h.lastMessages as Array<{ role: string }>).map((m) => m.role)
    expect(roles[0]).toBe("user")
  })

  it("leaves a chat with no project as a plain completion", async () => {
    h.turns = [[{ delta: "Hello." }, { delta: "", done: true, stopReason: "stop" }]]
    const lines = await drain(
      await ai.streamChat({
        providerId: "p1",
        messages: [{ role: "user", content: "hi" }],
      }),
    )
    expect(h.lastTools).toEqual([])
    expect(h.hasScopes).not.toHaveBeenCalled()
    expect(lines.some((l) => l.done === true)).toBe(true)
  })
})

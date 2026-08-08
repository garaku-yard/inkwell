import type {
  AIChatRequest,
  AIProviderSettings,
  AiStorage,
  RetrievedChunk,
  SaveProviderSettingsInput,
} from "@/lib/storage"
import { getAdapter } from "@/lib/ai/providers"
import type {
  AdapterMessage,
  ProviderAdapter,
  ProviderKind,
  StreamChunk,
  ToolSpec,
} from "@/lib/ai/providers"
import { deleteSecret, getSecret, setSecret } from "@/lib/secrets"
import { getDb, newId } from "./shared"
import { knowledge } from "./knowledge"
import { chatScope, findTool, parseToolArgs, requestApproval, toolSpecsFor } from "./tools"

// ─── AI (BYO keys, keychain-backed) ──────────────────────────────────────

interface AIProviderRow {
  id: string
  kind: string
  label: string
  enabled: number
  base_url: string | null
  default_model: string | null
  key_version: number
  created_at: number
  updated_at: number
}

const AI_COLUMNS =
  "id, kind, label, enabled, base_url, default_model, key_version, created_at, updated_at"

function keychainKey(providerId: string): string {
  return `ai.${providerId}`
}

function rowToSettings(row: AIProviderRow, hasKey: boolean): AIProviderSettings {
  return {
    id: row.id,
    kind: row.kind as ProviderKind,
    label: row.label,
    enabled: row.enabled === 1,
    baseUrl: row.base_url ?? undefined,
    defaultModel: row.default_model ?? undefined,
    hasKey,
  }
}

async function hasStoredKey(providerId: string): Promise<boolean> {
  try {
    const v = await getSecret(keychainKey(providerId))
    return v !== null
  } catch {
    return false
  }
}

async function loadProviderSettings(): Promise<AIProviderSettings[]> {
  const db = await getDb()
  const rows = await db.select<AIProviderRow[]>(
    `SELECT ${AI_COLUMNS} FROM ai_providers ORDER BY created_at ASC`,
  )
  const out: AIProviderSettings[] = []
  for (const row of rows) {
    out.push(rowToSettings(row, await hasStoredKey(row.id)))
  }
  return out
}

async function loadProviderRow(id: string): Promise<AIProviderRow> {
  const db = await getDb()
  const rows = await db.select<AIProviderRow[]>(
    `SELECT ${AI_COLUMNS} FROM ai_providers WHERE id = ?`,
    [id],
  )
  if (rows.length === 0) {
    throw new Error(`AI provider ${id} not found`)
  }
  return rows[0]
}

function toAdapterMessages(messages: AIChatRequest["messages"]): AdapterMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

/** Wraps the adapter's normalized StreamChunk stream into the NDJSON
 *  byte stream the existing chat panel parser consumes. Each chunk emits
 *  `{"response":"<delta>"}\n`; the terminal chunk emits `{"done":true}\n`. */
function chunkStreamToNDJSON(
  src: ReadableStream<StreamChunk>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return src.pipeThrough(
    new TransformStream<StreamChunk, Uint8Array>({
      transform(chunk, controller) {
        if (chunk.delta.length > 0) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ response: chunk.delta }) + "\n"),
          )
        }
        if (chunk.done) {
          controller.enqueue(encoder.encode(JSON.stringify({ done: true }) + "\n"))
        }
      },
    }),
  )
}

// ─── Vault-as-knowledge (RAG) ────────────────────────────────────────────

/** How many chunks to fold into the prompt per query. */
const RETRIEVAL_K = 8

/** Hard cap on tool-call → execute → continue iterations, so a model that
 *  keeps calling tools can't loop forever. */
const MAX_TOOL_ITERATIONS = 4

/** Builds the system message that injects retrieved note excerpts. Returns
 *  null when retrieval found nothing, so the caller can skip the injection. */
function buildKnowledgeSystem(chunks: RetrievedChunk[]): AdapterMessage | null {
  if (chunks.length === 0) return null
  const excerpts = chunks
    .map((c) => `[Note: ${c.title}]\n${c.text}`)
    .join("\n\n---\n\n")
  const content =
    "You have access to the writer's personal notes. The most relevant " +
    "excerpts for this question are below. Ground your answer in them and " +
    "cite note titles where useful. If they don't cover the question, reach " +
    "for your tools before guessing — and if they still don't, say so " +
    "plainly.\n\n" +
    `--- NOTES ---\n${excerpts}\n--- END NOTES ---`
  return { role: "system", content }
}

interface RagStreamOptions {
  adapter: ProviderAdapter
  conversation: AdapterMessage[]
  model: string
  apiKey?: string
  baseUrl?: string
  signal?: AbortSignal
  projectId: string
  /** The tools to declare each turn — already filtered to what this project
   *  can satisfy, so the loop doesn't re-derive availability per iteration. */
  tools: ToolSpec[]
}

/** Drives the call → execute → continue tool loop and flattens every
 *  adapter turn into the one NDJSON stream the chat panel consumes. Text
 *  deltas become `{"response":…}`; each tool call surfaces a
 *  `{"tool":name,"label":phrase}` line before its result is fed back, where
 *  the phrase is the tool's own wording of what it is doing; the final turn
 *  emits `{"done":true}`. Mid-stream failures emit `{"error":…}` as the last
 *  line, matching the gateway's contract.
 *
 *  Which tools exist and what they do is the registry's business (`./tools`),
 *  not this loop's — it only sequences call, aside, execute, continue. */
function ragStream(opts: RagStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
      }
      const conversation = [...opts.conversation]
      try {
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const stream = opts.adapter.streamChat({
            messages: conversation,
            model: opts.model,
            apiKey: opts.apiKey,
            baseUrl: opts.baseUrl,
            signal: opts.signal,
            tools: opts.tools,
          })
          const reader = stream.getReader()
          const pendingCalls: NonNullable<StreamChunk["toolCall"]>[] = []
          let assistantText = ""
          let stopReason: "stop" | "tool_use" = "stop"
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              if (value.delta.length > 0) {
                assistantText += value.delta
                emit({ response: value.delta })
              }
              if (value.toolCall) pendingCalls.push(value.toolCall)
              if (value.done) stopReason = value.stopReason ?? "stop"
            }
          } finally {
            reader.releaseLock()
          }

          if (stopReason !== "tool_use" || pendingCalls.length === 0) {
            emit({ done: true })
            controller.close()
            return
          }

          // Record the assistant's tool-call turn, then run each call and
          // append its result so the next iteration can continue.
          conversation.push({
            role: "assistant",
            content: assistantText,
            toolCalls: pendingCalls,
          })
          for (const call of pendingCalls) {
            const tool = findTool(call.name)
            let result: string
            if (tool) {
              const args = parseToolArgs(call.args)
              const ctx = { projectId: opts.projectId, source: "chat" as const }
              // A tool that can take writing away waits for the writer (ADR
              // 0027). Asking before the aside is emitted keeps the transcript
              // honest: a declined call never claims it was deleting anything.
              const decision = tool.destructive
                ? await requestApproval({
                    tool: tool.spec.name,
                    label: tool.label(args),
                    detail: tool.describe ? await tool.describe(args, ctx).catch(() => "") : "",
                    source: "chat",
                    scope: chatScope(opts.projectId),
                  })
                : null
              if (decision && decision.outcome !== "allowed") {
                emit({ tool: tool.spec.name, label: `${tool.label(args)} — declined` })
                result = decision.message
              } else {
                emit({ tool: tool.spec.name, label: tool.label(args) })
                result = await tool.run(args, ctx)
              }
            } else {
              result = `Unknown tool: ${call.name}`
            }
            conversation.push({
              role: "tool",
              content: result,
              toolCallId: call.id,
              name: call.name,
            })
          }
        }
        // Tool budget exhausted — close cleanly so the partial answer stays.
        emit({ done: true })
        controller.close()
      } catch (err) {
        try {
          emit({ error: (err as Error).message })
        } catch {
          // Controller already torn down (e.g. consumer cancelled) — nothing
          // more to surface.
        }
        controller.close()
      }
    },
  })
}

export const ai: AiStorage = {
  async streamChat(
    request: AIChatRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ReadableStream<Uint8Array>> {
    if (!request.providerId) {
      throw new Error(
        "streamChat requires providerId — pick a configured provider in Settings → AI",
      )
    }
    const row = await loadProviderRow(request.providerId)
    if (row.enabled !== 1) {
      throw new Error(`AI provider "${row.label}" is disabled`)
    }
    const model = request.model ?? row.default_model
    if (!model) {
      throw new Error(
        `No model specified and no default model set for "${row.label}"`,
      )
    }
    const apiKey = await getSecret(keychainKey(row.id))
    const adapter = getAdapter(row.kind as ProviderKind)
    const baseUrl = row.base_url ?? undefined

    // Every tool acts on a project, so a project is what the tool loop needs —
    // not a wired vault. A chat open on a project can list its scenes and read
    // them whether or not any notes are attached; wiring notes adds retrieval
    // and the note tools on top. Without a project there is nothing to act on,
    // so that path stays a plain completion: no retrieval, no tools, no
    // model load.
    const projectId = request.projectId
    if (projectId) {
      const knowledgeOn = await knowledge.hasScopes(projectId)
      const conversation: AdapterMessage[] = toAdapterMessages(request.messages)
      if (knowledgeOn) {
        const lastUser = [...request.messages]
          .reverse()
          .find((m) => m.role === "user")?.content
        const chunks = lastUser
          ? await knowledge.retrieve(projectId, lastUser, RETRIEVAL_K)
          : []
        const systemMsg = buildKnowledgeSystem(chunks)
        if (systemMsg) conversation.unshift(systemMsg)
      }
      return ragStream({
        adapter,
        conversation,
        model,
        apiKey: apiKey ?? undefined,
        baseUrl,
        signal: options?.signal,
        projectId,
        tools: toolSpecsFor({ knowledge: knowledgeOn }),
      })
    }

    const stream = adapter.streamChat({
      messages: toAdapterMessages(request.messages),
      model,
      apiKey: apiKey ?? undefined,
      baseUrl,
      signal: options?.signal,
    })
    return chunkStreamToNDJSON(stream)
  },

  listProviderSettings: loadProviderSettings,

  // Desktop has no hosted account, so no managed (Inkwell-keyed) providers —
  // the desktop app dispatches BYO keys directly from the user's machine.
  async listManagedProviders(): Promise<AIProviderSettings[]> {
    return []
  },

  async saveProviderSettings(
    input: SaveProviderSettingsInput,
  ): Promise<AIProviderSettings> {
    const db = await getDb()
    const ts = Date.now()
    const enabled = input.enabled ? 1 : 0

    if (input.id) {
      await db.execute(
        `UPDATE ai_providers
           SET kind = ?, label = ?, enabled = ?, base_url = ?, default_model = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.kind,
          input.label,
          enabled,
          input.baseUrl ?? null,
          input.defaultModel ?? null,
          ts,
          input.id,
        ],
      )
      return {
        id: input.id,
        kind: input.kind,
        label: input.label,
        enabled: input.enabled,
        baseUrl: input.baseUrl,
        defaultModel: input.defaultModel,
        hasKey: await hasStoredKey(input.id),
      }
    }

    const id = newId()
    await db.execute(
      `INSERT INTO ai_providers (${AI_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        input.kind,
        input.label,
        enabled,
        input.baseUrl ?? null,
        input.defaultModel ?? null,
        ts,
        ts,
      ],
    )
    return {
      id,
      kind: input.kind,
      label: input.label,
      enabled: input.enabled,
      baseUrl: input.baseUrl,
      defaultModel: input.defaultModel,
      hasKey: false,
    }
  },

  async deleteProviderSettings(id: string): Promise<void> {
    const db = await getDb()
    await db.execute("DELETE FROM ai_providers WHERE id = ?", [id])
    await deleteSecret(keychainKey(id)).catch(() => {
      // Deletion is best-effort: the row is gone even if the keychain
      // entry can't be cleared (daemon down, already removed, etc.). The
      // orphan entry is harmless since nothing else references this id.
    })
  },

  async setApiKey(id: string, apiKey: string): Promise<void> {
    await setSecret(keychainKey(id), apiKey)
  },

  async clearApiKey(id: string): Promise<void> {
    await deleteSecret(keychainKey(id))
  },

  async testProvider(
    id: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const row = await loadProviderRow(id)
      const apiKey = await getSecret(keychainKey(id))
      const model = row.default_model
      if (!model) {
        return {
          ok: false,
          error: "Set a default model before testing the connection.",
        }
      }
      const adapter = getAdapter(row.kind as ProviderKind)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        const stream = adapter.streamChat({
          messages: [{ role: "user", content: "ping" }],
          model,
          apiKey: apiKey ?? undefined,
          baseUrl: row.base_url ?? undefined,
          signal: controller.signal,
        })
        const reader = stream.getReader()
        try {
          await reader.read()
        } finally {
          reader.releaseLock()
          await stream.cancel().catch(() => {})
        }
        return { ok: true }
      } finally {
        clearTimeout(timeout)
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },
}

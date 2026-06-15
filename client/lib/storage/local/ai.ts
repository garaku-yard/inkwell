import type {
  AIChatRequest,
  AIProviderSettings,
  AiStorage,
  SaveProviderSettingsInput,
} from "@/lib/storage"
import { getAdapter } from "@/lib/ai/providers"
import type { AdapterMessage, ProviderKind, StreamChunk } from "@/lib/ai/providers"
import { deleteSecret, getSecret, setSecret } from "@/lib/secrets"
import { getDb, newId } from "./shared"

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
    const stream = adapter.streamChat({
      messages: toAdapterMessages(request.messages),
      model,
      apiKey: apiKey ?? undefined,
      baseUrl: row.base_url ?? undefined,
      signal: options?.signal,
    })
    return chunkStreamToNDJSON(stream)
  },

  listProviderSettings: loadProviderSettings,

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

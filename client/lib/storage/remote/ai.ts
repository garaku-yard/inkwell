import { apiClient, apiStreamClient, ApiError } from "@/lib/api"

import type {
  AIChatRequest,
  AIProviderSettings,
  AiStorage,
  SaveProviderSettingsInput,
} from "@/lib/storage"
import { getAdapter } from "@/lib/ai/providers"
import type { AdapterMessage, ProviderKind, StreamChunk } from "@/lib/ai/providers"

// ─── AI ───────────────────────────────────────────────────────────────────

// Web BYO is scoped to `openai_compatible` endpoints (Ollama, LM Studio,
// OpenRouter, custom deployments). Configuration and optional API keys
// live in localStorage on this build — local models can't be proxied
// through our server anyway (they live on the user's own machine), and
// the server-side encrypted store for hosted providers isn't ready yet
// (plan phase 4). Hosted kinds throw NotSupportedError until then.

const WEB_PROVIDERS_KEY = "inkwell.ai.providers"
const WEB_KEY_PREFIX = "inkwell.ai.key."

interface StoredProviderRow {
  id: string
  kind: ProviderKind
  label: string
  enabled: boolean
  baseUrl?: string
  defaultModel?: string
}

function readStoredRows(): StoredProviderRow[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(WEB_PROVIDERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is StoredProviderRow =>
      typeof r?.id === "string" && typeof r?.kind === "string",
    )
  } catch {
    return []
  }
}

function writeStoredRows(rows: StoredProviderRow[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(WEB_PROVIDERS_KEY, JSON.stringify(rows))
}

function readStoredKey(id: string): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(WEB_KEY_PREFIX + id)
}

function writeStoredKey(id: string, key: string): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(WEB_KEY_PREFIX + id, key)
}

function clearStoredKey(id: string): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(WEB_KEY_PREFIX + id)
}

function rowToSettings(row: StoredProviderRow): AIProviderSettings {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    enabled: row.enabled,
    baseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
    hasKey: readStoredKey(row.id) !== null,
  }
}

function toAdapterMessages(messages: AIChatRequest["messages"]): AdapterMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

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

function newWebId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Server-side DTOs for the hosted-BYO API. Shape matches
// server/internal/gateway/handlers/aisettings.go.
interface HostedSettingDTO {
  id: string
  kind: ProviderKind
  label: string
  enabled: boolean
  baseUrl?: string
  defaultModel?: string
  hasKey: boolean
}

function hostedDTOtoSettings(d: HostedSettingDTO): AIProviderSettings {
  return {
    id: d.id,
    kind: d.kind,
    label: d.label,
    enabled: d.enabled,
    baseUrl: d.baseUrl,
    defaultModel: d.defaultModel,
    hasKey: d.hasKey,
  }
}

// isLocalKind flags which kinds live in browser localStorage vs on the
// server. Only `openai_compatible` stays in the browser because the
// server can't reach the user's localhost — everything else is hosted.
function isLocalKind(kind: ProviderKind): boolean {
  return kind === "openai_compatible"
}

// locateRow returns the store a given id lives in. Local ids are always
// present in localStorage; everything else is hosted. Caller handles
// "neither" by propagating a server 404.
function locateRow(id: string): "local" | "hosted" {
  return readStoredRows().some((r) => r.id === id) ? "local" : "hosted"
}

export const ai: AiStorage = {
  async streamChat(
    request: AIChatRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ReadableStream<Uint8Array>> {
    // Local openai_compatible rows dispatch through the adapter library
    // directly — only the browser can reach the user's Ollama on
    // localhost. Hosted rows go through the gateway, which fetches the
    // decrypted key and calls the provider server-side.
    if (request.providerId && locateRow(request.providerId) === "local") {
      const rows = readStoredRows()
      const row = rows.find((r) => r.id === request.providerId)
      if (row) {
        if (!row.enabled) throw new Error(`AI provider "${row.label}" is disabled`)
        const model = request.model ?? row.defaultModel
        if (!model) {
          throw new Error(
            `No model specified and no default model set for "${row.label}"`,
          )
        }
        const apiKey = readStoredKey(row.id)
        const adapter = getAdapter(row.kind)
        const stream = adapter.streamChat({
          messages: toAdapterMessages(request.messages),
          model,
          apiKey: apiKey ?? undefined,
          baseUrl: row.baseUrl,
          signal: options?.signal,
        })
        return chunkStreamToNDJSON(stream)
      }
    }

    // Gateway path — legacy hosted (no providerId) and hosted BYO
    // (providerId resolves server-side).
    return apiStreamClient("api/ai/chat", {
      method: "POST",
      body: { provider: "ollama", stream: true, ...request },
      signal: options?.signal,
    })
  },

  async listProviderSettings(): Promise<AIProviderSettings[]> {
    const local = readStoredRows().map(rowToSettings)
    try {
      const hosted = await apiClient<HostedSettingDTO[]>("api/ai/settings")
      return [...hosted.map(hostedDTOtoSettings), ...local]
    } catch (err) {
      // Propagate auth failures so the UI can prompt re-login instead of
      // silently pretending the user has no hosted providers. Treat
      // "endpoint not deployed" (404 / 501) as graceful degradation —
      // the hosted-BYO service may not be running yet on this build.
      // Everything else re-throws so genuine failures surface.
      if (err instanceof ApiError) {
        if (err.status === 404 || err.status === 501) {
          return local
        }
      }
      throw err
    }
  },

  async saveProviderSettings(
    input: SaveProviderSettingsInput,
  ): Promise<AIProviderSettings> {
    if (isLocalKind(input.kind)) {
      const rows = readStoredRows()
      if (input.id) {
        const idx = rows.findIndex((r) => r.id === input.id)
        if (idx === -1) throw new Error(`AI provider ${input.id} not found`)
        const updated: StoredProviderRow = {
          id: input.id,
          kind: input.kind,
          label: input.label,
          enabled: input.enabled,
          baseUrl: input.baseUrl,
          defaultModel: input.defaultModel,
        }
        rows[idx] = updated
        writeStoredRows(rows)
        return rowToSettings(updated)
      }
      const row: StoredProviderRow = {
        id: newWebId(),
        kind: input.kind,
        label: input.label,
        enabled: input.enabled,
        baseUrl: input.baseUrl,
        defaultModel: input.defaultModel,
      }
      rows.push(row)
      writeStoredRows(rows)
      return rowToSettings(row)
    }

    // Hosted kinds — POST/PUT to the gateway.
    const body = {
      kind: input.kind,
      label: input.label,
      enabled: input.enabled,
      baseUrl: input.baseUrl,
      defaultModel: input.defaultModel,
    }
    if (input.id) {
      const dto = await apiClient<HostedSettingDTO>(
        `api/ai/settings/${encodeURIComponent(input.id)}`,
        { method: "PUT", body },
      )
      return hostedDTOtoSettings(dto)
    }
    const dto = await apiClient<HostedSettingDTO>("api/ai/settings", {
      method: "POST",
      body,
    })
    return hostedDTOtoSettings(dto)
  },

  async deleteProviderSettings(id: string): Promise<void> {
    if (locateRow(id) === "local") {
      writeStoredRows(readStoredRows().filter((r) => r.id !== id))
      clearStoredKey(id)
      return
    }
    await apiClient<void>(`api/ai/settings/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
  },

  async setApiKey(id: string, apiKey: string): Promise<void> {
    if (locateRow(id) === "local") {
      if (!readStoredRows().some((r) => r.id === id)) {
        throw new Error(`AI provider ${id} not found`)
      }
      writeStoredKey(id, apiKey)
      return
    }
    await apiClient<void>(`api/ai/settings/${encodeURIComponent(id)}/key`, {
      method: "POST",
      body: { apiKey },
    })
  },

  async clearApiKey(id: string): Promise<void> {
    if (locateRow(id) === "local") {
      clearStoredKey(id)
      return
    }
    await apiClient<void>(`api/ai/settings/${encodeURIComponent(id)}/key`, {
      method: "DELETE",
    })
  },

  async testProvider(
    id: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    // Both stores test the same way: open a short chat request and read
    // one chunk. For hosted kinds this round-trips to the gateway, which
    // dispatches via its own adapter library; for local kinds the test
    // stays in the browser.
    try {
      if (locateRow(id) === "local") {
        const rows = readStoredRows()
        const row = rows.find((r) => r.id === id)
        if (!row) return { ok: false, error: "provider not found" }
        const model = row.defaultModel
        if (!model) {
          return {
            ok: false,
            error: "Set a default model before testing the connection.",
          }
        }
        const apiKey = readStoredKey(id)
        const adapter = getAdapter(row.kind)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          const stream = adapter.streamChat({
            messages: [{ role: "user", content: "ping" }],
            model,
            apiKey: apiKey ?? undefined,
            baseUrl: row.baseUrl,
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
      }

      // Hosted test: ping through the gateway by starting a chat stream
      // and closing it after the first chunk. Any upstream error surfaces
      // as an HTTP error with the provider's message in the body.
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        const stream = await apiStreamClient("api/ai/chat", {
          method: "POST",
          body: {
            providerId: id,
            messages: [{ role: "user", content: "ping" }],
            stream: true,
          },
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

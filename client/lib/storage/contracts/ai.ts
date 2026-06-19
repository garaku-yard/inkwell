import type { AIChatRequest } from "@/services/ai"
import type { ProviderKind } from "@/lib/ai/providers"

// ─── AI ───────────────────────────────────────────────────────────────────

/** One configured AI provider row as surfaced to the UI. The raw API key
 *  is never included in this shape — it's stored in the OS keychain
 *  (desktop) or encrypted server-side (web) and accessed only at chat
 *  dispatch time. `hasKey` lets the settings UI show the correct badge
 *  without round-tripping the secret. */
export interface AIProviderSettings {
  /** Stable id used as the keychain account name (`ai.<id>`). Generated
   *  on create; never changes. */
  id: string
  kind: ProviderKind
  /** User-facing label shown in the settings list and chat-panel picker. */
  label: string
  enabled: boolean
  /** Present for `openai_compatible` (Ollama, LM Studio, custom endpoints);
   *  ignored for the hosted kinds. */
  baseUrl?: string
  /** Pre-filled default model for the chat-panel picker. Users can still
   *  override per conversation. */
  defaultModel?: string
  /** True when a key is present in the keychain for this provider. The
   *  raw key value is never sent across the IPC boundary except during
   *  `setApiKey`. */
  hasKey: boolean
}

/** Input accepted by {@link AiStorage.saveProviderSettings}. Omits fields
 *  that the storage layer owns: `id` (generated on create), `hasKey`
 *  (derived from keychain state). `id` is optional; pass it to update an
 *  existing row, omit it to create a new one. */
export interface SaveProviderSettingsInput {
  id?: string
  kind: ProviderKind
  label: string
  enabled: boolean
  baseUrl?: string
  defaultModel?: string
}

/** Optional controls for {@link AiStorage.streamChat}. Callers pass a
 *  signal to abort the underlying fetch — and therefore the provider
 *  stream — partway through. */
export interface StreamChatOptions {
  signal?: AbortSignal
}

export interface AiStorage {
  /** NDJSON streaming chat completion. Desktop calls the provider directly
   *  with the user's BYO key; web delegates to the gateway's BYO endpoint
   *  which decrypts the key server-side. Both paths require the request
   *  to name a provider row by id. */
  streamChat(
    request: AIChatRequest,
    options?: StreamChatOptions,
  ): Promise<ReadableStream<Uint8Array>>

  // ── BYO provider configuration (capability: "ai.byo") ────────────────

  /** List all configured BYO providers, ordered by creation time. Never
   *  returns the raw API key — see `hasKey` on {@link AIProviderSettings}
   *  instead. */
  listProviderSettings(): Promise<AIProviderSettings[]>
  /** List managed (Inkwell-keyed) providers this deployment offers, shaped as
   *  provider rows (id `managed:<kind>`) so the chat picker can show them next
   *  to BYO. Managed usage is metered and capped per the user's tier. Empty on
   *  desktop and when the server has no managed keys configured. */
  listManagedProviders(): Promise<AIProviderSettings[]>
  /** Create or update a provider row. Returns the saved record (with
   *  generated `id` when creating). Does not touch the stored API key. */
  saveProviderSettings(input: SaveProviderSettingsInput): Promise<AIProviderSettings>
  /** Delete a provider row and its keychain entry. Safe to call on an id
   *  that no longer exists — resolves rather than throws. */
  deleteProviderSettings(id: string): Promise<void>
  /** Set the API key for a provider row. The plaintext key is written
   *  straight to the OS keychain (desktop) or POSTed to the encrypted
   *  server-side store (web); it is never persisted elsewhere. */
  setApiKey(id: string, apiKey: string): Promise<void>
  /** Remove the stored API key for a provider row. The row itself stays;
   *  only its `hasKey` flag flips to false. */
  clearApiKey(id: string): Promise<void>
  /** Exercise the configured credentials with a cheap provider-specific
   *  probe (a 1-token completion or `/models` list). Returns `{ok: true}`
   *  on success and `{ok: false, error}` on failure — callers render the
   *  error message next to the Test button rather than catching. */
  testProvider(id: string): Promise<{ ok: true } | { ok: false; error: string }>
}

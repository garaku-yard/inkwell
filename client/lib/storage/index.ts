/**
 * Storage — single abstraction every UI call funnels through.
 *
 * Inkwell ships in two flavours: a hosted web build that talks to the Go
 * gateway, and a local-first desktop build (Tauri) that stores everything on
 * disk in SQLite. Both wear the same API shape so the UI layer doesn't need
 * to know which backend is underneath.
 *
 * ## Layout
 *
 * - {@link Storage} is a flat object of sub-interfaces, one per bounded
 *   context (`projects`, `scenes`, `beats`, …). Sub-interfaces stay
 *   alphabetical to keep diffs boring.
 * - Capabilities that only the hosted build can satisfy (real-time collab,
 *   admin, central auth) live behind {@link Capability} probes. Callers that
 *   depend on one must either gate on `storage.capabilities.has("xyz")` or
 *   be prepared to catch {@link NotSupportedError}.
 * - Data types are re-exported from the existing `client/services/*` files
 *   so we don't fork the vocabulary. When a type moves, the import moves
 *   with it.
 *
 * ## Implementations
 *
 * - `remote.ts` — wraps the existing `apiClient` / `apiStreamClient` calls.
 *   Drop-in replacement for today's services. Built in Phase 2 step 3.
 * - `local.ts` — talks to `tauri-plugin-sql` via IPC, mirroring the scripts
 *   service's Postgres schema in SQLite. Built in Phase 2 step 5.
 *
 * ## Not implemented yet
 *
 * This file is an *interface-only* draft. The factory at the bottom is a
 * stub that throws until we ship `remote.ts`. Importing `Storage` or the
 * supporting types is safe today; calling `getStorage()` is not.
 */

import { NotSupportedError, StorageError } from "./errors"

import type {
  AdminBillingStorage,
  AiStorage,
  AuthStorage,
  BeatBoardStorage,
  CharacterStorage,
  CollaborationStorage,
  ElementStorage,
  KnowledgeStorage,
  LocationStorage,
  NotificationsStorage,
  ProjectStorage,
  SceneStorage,
  SettingsStorage,
  VaultStorage,
  WorkspaceStorage,
} from "./contracts"

export * from "./errors"
export * from "./contracts"

// ─── Capabilities ──────────────────────────────────────────────────────────

/** Optional feature areas a Storage implementation can declare. The remote
 *  implementation supports all of them; the local (desktop) one declares
 *  only the subset that works offline. */
export type Capability =
  | "auth" // Central login / register / sessions (remote only).
  | "collaboration" // Shared projects, collaborators, invites, comments.
  | "realtime" // Presence + live cursors (never in local build).
  | "admin" // Billing admin endpoints (remote only).
  | "ai.byo" // BYO-key AI providers configurable in settings.
  | "ai.knowledge" // Vault-as-knowledge RAG for the AI chat (desktop only).
  | "notifications" // Server-side notification prefs + delivery (remote only).

// ─── Root Storage ────────────────────────────────────────────────────────

/** Root abstraction composed of per-domain sub-interfaces. */
export interface Storage {
  readonly capabilities: ReadonlySet<Capability>

  auth: AuthStorage
  projects: ProjectStorage
  scenes: SceneStorage
  elements: ElementStorage
  characters: CharacterStorage
  locations: LocationStorage
  beatBoard: BeatBoardStorage
  workspaces: WorkspaceStorage
  collaboration: CollaborationStorage
  notifications: NotificationsStorage
  settings: SettingsStorage
  vault: VaultStorage
  knowledge: KnowledgeStorage
  ai: AiStorage
  admin: { billing: AdminBillingStorage }
}

// ─── Factory ──────────────────────────────────────────────────────────────

let instance: Storage | null = null

/**
 * Returns the process-wide Storage instance. The web build binds to the
 * remote implementation; the Tauri build binds to the local one at module
 * init time. Until the implementations land in Phase 2 step 3/5, this
 * throws — on purpose — so we notice if something imports it prematurely.
 */
export function getStorage(): Storage {
  if (instance) return instance
  throw new StorageError(
    "Storage has no implementation bound yet — waiting on Phase 2 step 3 (remote.ts) and step 5 (local.ts).",
  )
}

/** Bind a concrete Storage implementation. Usually called once at app boot,
 *  but `StorageProvider` may call it a second time in the desktop build after
 *  the async local impl finishes loading, so subsequent calls replace the
 *  existing instance rather than throwing. */
export function setStorage(impl: Storage): void {
  instance = impl
}

/** Convenience guard for callers that want to branch on a capability without
 *  first pulling the whole Storage object. Throws {@link NotSupportedError}
 *  when the current build cannot honour the request. */
export function requireCapability(storage: Storage, cap: Capability): void {
  if (!storage.capabilities.has(cap)) {
    throw new NotSupportedError(cap)
  }
}

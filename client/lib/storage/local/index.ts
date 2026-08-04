/**
 * Local Storage implementation — backed by SQLite via `tauri-plugin-sql`.
 *
 * This is what the desktop build uses: nearly every call reads/writes the
 * user's on-disk `inkwell.db` inside the Tauri appdata dir, with no network
 * involvement, no central account, and no collaboration.
 *
 * The one deliberate exception is `organizations`, which is served by the
 * gateway even here (ADR 0023) — an org is shared multi-user tenancy and has no
 * meaningful single-user local form. See `./organizations.ts`.
 *
 * ## Capabilities
 *
 * The `capabilities` set declared at the bottom names only what this
 * implementation can honour. Anything else (`collaboration`, `realtime`,
 * `admin`) throws {@link NotSupportedError} — the UI is expected to
 * probe `storage.capabilities.has(...)` and hide those affordances
 * rather than call them.
 *
 * ## Auth model
 *
 * The desktop app has no login flow. `auth.me()` returns (or lazily creates)
 * a single-row `user_profile` record so the React auth layer sees "always
 * signed in." `login` / `register` are no-ops that return the same profile
 * so the existing login/register pages still work if they're hit.
 *
 * ## Database lifetime
 *
 * The plugin handles migrations in Rust (`src-tauri/migrations/0001_initial.sql`).
 * The first call to {@link getDb} lazily opens the connection; subsequent
 * calls reuse it for the lifetime of the webview.
 */

import type { Capability, Storage } from "@/lib/storage"

import { auth } from "./auth"
import { projects } from "./projects"
import { scenes } from "./scenes"
import { elements } from "./elements"
import { characters } from "./characters"
import { locations } from "./locations"
import { beatBoard } from "./beat-board"
import { workspaces } from "./workspaces"
import { organizations } from "./organizations"
import { collaboration } from "./collaboration"
import { notifications } from "./notifications"
import { settings } from "./settings"
import { vault } from "./vault"
import { knowledge } from "./knowledge"
import { ai } from "./ai"
import { billing } from "./billing"
import { adminBilling } from "./admin-billing"
import { sync } from "./sync"

// ─── Root Storage ─────────────────────────────────────────────────────────

/** Capabilities honoured by the local build. Notable omissions: `auth`
 *  (no real login), `collaboration`, `realtime`, `admin`. BYO AI
 *  providers are supported because we have the OS keychain and a direct
 *  client-side adapter library. `sync` is desktop-only and gated further on a
 *  linked account at runtime (see SyncStorage.isAvailable).
 *
 *  `organizations` is the one capability here that is *not* served by SQLite:
 *  the desktop delegates that domain to the gateway (ADR 0023). Like `sync` it
 *  is gated further on a linked account at runtime — see
 *  OrganizationStorage.isAvailable. */
const LOCAL_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "ai.byo",
  "ai.knowledge",
  "sync",
  "organizations",
])

/** Returns a Storage backed by local SQLite via `tauri-plugin-sql`. */
export function createLocalStorage(): Storage {
  return {
    capabilities: LOCAL_CAPABILITIES,
    auth,
    projects,
    scenes,
    elements,
    characters,
    locations,
    beatBoard,
    workspaces,
    organizations,
    collaboration,
    notifications,
    settings,
    vault,
    knowledge,
    ai,
    billing,
    admin: { billing: adminBilling },
    sync,
  }
}

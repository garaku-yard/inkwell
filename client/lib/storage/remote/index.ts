/**
 * Remote Storage implementation — every method talks to the Go gateway via
 * `apiClient` / `apiStreamClient`. This file owns all of the HTTP wire
 * formatting and response-shape mapping; `services/*` files will delegate to
 * the Storage interface rather than call `apiClient` themselves, so a local
 * (SQLite) implementation can drop in without every callsite being aware.
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
import { collaboration } from "./collaboration"
import { notifications } from "./notifications"
import { settings } from "./settings"
import { vault } from "./vault"
import { knowledge } from "./knowledge"
import { ai } from "./ai"
import { billing } from "./billing"
import { adminBilling } from "./admin-billing"

// The remote build exposes every capability the gateway supports. Hosted
// BYO providers (OpenAI / Anthropic / Gemini) are served by the
// ai-settings microservice; local/compatible rows stay in localStorage
// because the server can't reach the user's localhost.
const REMOTE_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "auth",
  "collaboration",
  "realtime",
  "admin",
  "ai.byo",
  "notifications",
])

// ─── Root Storage ─────────────────────────────────────────────────────────

/** Returns a Storage implementation that talks to the Go gateway via HTTP. */
export function createRemoteStorage(): Storage {
  return {
    capabilities: REMOTE_CAPABILITIES,
    auth,
    projects,
    scenes,
    elements,
    characters,
    locations,
    beatBoard,
    workspaces,
    collaboration,
    notifications,
    settings,
    vault,
    knowledge,
    ai,
    billing,
    admin: { billing: adminBilling },
  }
}

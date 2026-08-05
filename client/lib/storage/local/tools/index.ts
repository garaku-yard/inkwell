/**
 * Tool registry — the capabilities an AI consumer may invoke against the
 * writer's data, defined once as data (ADR 0025).
 *
 * Two consumers share these definitions: the in-app knowledge chat, whose
 * tool loop lives in `../ai.ts`, and (later) an MCP bridge hosted inside the
 * Tauri app. Both read the same specs and call the same handlers, so a
 * capability added here reaches both without a second implementation.
 *
 * This is desktop-only by construction: handlers reach the writer's SQLite
 * through the sibling local storage modules, which only work inside a Tauri
 * webview. The gateway runs no tool loop at all, so the hosted build gains
 * nothing here — see 0025 for why that stays true until someone writes the Go
 * equivalent.
 */

import type { ToolSpec } from "@/lib/ai/providers"

import { addBeat } from "./add-beat"
import { appendToScene } from "./append-to-scene"
import { createProject } from "./create-project"
import { createScene } from "./create-scene"
import { listProjects } from "./list-projects"
import { listScenes } from "./list-scenes"
import { readNote } from "./read-note"
import { readScene } from "./read-scene"
import { searchNotes } from "./search-notes"
import type { ToolArgs, ToolEntry } from "./types"

export type { ToolArgs, ToolContext, ToolEntry, ToolRequirement } from "./types"

/** Every registered tool, in the order the model is shown them: find your way
 *  around, read, then write. */
const ENTRIES: ToolEntry[] = [
  listProjects,
  listScenes,
  readScene,
  searchNotes,
  readNote,
  createProject,
  createScene,
  appendToScene,
  addBeat,
]

const BY_NAME = new Map(ENTRIES.map((entry) => [entry.spec.name, entry]))

/** What the project can currently satisfy, deciding which tools are worth
 *  declaring this turn. */
export interface ToolAvailability {
  /** The project has vault notes wired as knowledge. */
  knowledge: boolean
}

/** The declarations to offer the model, minus the ones whose precondition
 *  this project doesn't meet. Offering a tool that can only answer "nothing
 *  is wired" spends the model's attention to teach it a dead end. */
export function toolSpecsFor(available: ToolAvailability): ToolSpec[] {
  return ENTRIES.filter(
    (entry) => entry.requires !== "knowledge" || available.knowledge,
  ).map((entry) => entry.spec)
}

/** Every registered tool, availability aside.
 *
 *  The MCP bridge lists these rather than `toolSpecsFor`: an MCP client reads
 *  the tool list once and caches it, so a list that shrinks when no notes are
 *  wired would leave the client believing tools exist that it can no longer
 *  see, or the reverse. The chat re-declares tools every turn and can afford
 *  to be selective; the bridge answers "nothing is wired" at call time. */
export function allTools(): readonly ToolEntry[] {
  return ENTRIES
}

/** Looks up a registered tool by the name the model called. Returns
 *  undefined for a name that isn't registered — models do hallucinate tools,
 *  and the caller answers that with a tool result rather than an error. */
export function findTool(name: string): ToolEntry | undefined {
  return BY_NAME.get(name)
}

/** Decodes a call's JSON argument blob. Malformed or non-object arguments
 *  degrade to an empty argument set, so the handler answers with its own
 *  "nothing matched" result instead of breaking the stream. */
export function parseToolArgs(raw: string): ToolArgs {
  try {
    const parsed: unknown = JSON.parse(raw || "{}")
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ToolArgs)
      : {}
  } catch {
    return {}
  }
}

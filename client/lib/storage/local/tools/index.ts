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

import { readNote } from "./read-note"
import type { ToolArgs, ToolEntry } from "./types"

export type { ToolArgs, ToolContext, ToolEntry } from "./types"

/** Every registered tool, in the order the model is shown them. */
const ENTRIES: ToolEntry[] = [readNote]

const BY_NAME = new Map(ENTRIES.map((entry) => [entry.spec.name, entry]))

/** The declarations to offer the model on each turn. */
export const TOOL_SPECS: ToolSpec[] = ENTRIES.map((entry) => entry.spec)

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

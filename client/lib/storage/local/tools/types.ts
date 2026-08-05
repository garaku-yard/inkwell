import type { ToolSpec } from "@/lib/ai/providers"

/** Decoded tool-call arguments. The values are whatever the model produced,
 *  so handlers narrow each field before using it. */
export type ToolArgs = Record<string, unknown>

/** What a handler is told about its caller. Both consumers named in ADR 0025 —
 *  the knowledge chat and the MCP bridge — act on one open project, so the id
 *  is required rather than optional; widen this when a tool arrives that
 *  genuinely works without one. */
export interface ToolContext {
  projectId: string
}

/** A precondition the project must meet before a tool is worth offering.
 *  `"knowledge"` means the project has vault notes wired as knowledge —
 *  without any, the note tools can only ever answer "nothing is in scope",
 *  so they are left out of the declarations entirely rather than offered and
 *  then apologised for. */
export type ToolRequirement = "knowledge"

/** One capability an AI consumer may invoke: the declaration providers turn
 *  into their native tool format, paired with the handler that runs it.
 *  Adding a capability is adding an entry — there is no dispatch site to
 *  edit. */
export interface ToolEntry {
  spec: ToolSpec
  /** What the project must have for this tool to be offered. Omitted when the
   *  tool works in any project. */
  requires?: ToolRequirement
  /** `"account"` marks a tool that acts across the writer's work rather than
   *  on one project, and so must not read `ctx.projectId`. The in-app chat
   *  always has a project and ignores this; a consumer without one (the MCP
   *  bridge, before a project is chosen) uses it to know which tools it can
   *  run yet. Omitted means project-scoped. */
  scope?: "account"
  /** True when running the tool writes to the writer's data. Nothing reads
   *  this yet: it is declared from the first entry because the confirmation
   *  semantics in ADR 0025 need the read/write distinction recorded per tool,
   *  not reconstructed later by guessing from tool names. */
  mutates: boolean
  /** A short present-tense phrase naming what this call is doing —
   *  `Reading "Cats"`, `Listing scenes`. It is shown to the reader as an
   *  aside while the tool runs, so each tool words its own activity instead
   *  of the chat panel guessing a verb per tool name. */
  label(args: ToolArgs): string
  /** Runs the call and returns the text fed back to the model as the tool
   *  result. Arguments arrive parsed but unvalidated — a model can send
   *  anything — so read them defensively and answer in prose rather than
   *  throwing, which would tear down the stream mid-answer. */
  run(args: ToolArgs, ctx: ToolContext): Promise<string>
}

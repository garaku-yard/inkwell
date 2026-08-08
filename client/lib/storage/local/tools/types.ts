import type { ToolSpec } from "@/lib/ai/providers"

import type { ApprovalSource } from "./approval"

/** Decoded tool-call arguments. The values are whatever the model produced,
 *  so handlers narrow each field before using it. */
export type ToolArgs = Record<string, unknown>

/** What a handler is told about its caller. Both consumers named in ADR 0025 —
 *  the knowledge chat and the MCP bridge — act on one open project, so the id
 *  is required rather than optional; widen this when a tool arrives that
 *  genuinely works without one. */
export interface ToolContext {
  projectId: string
  /** Which consumer is running this call. Destructive handlers record it in the
   *  undo journal so the writer's "recently changed" list can say whether the
   *  chat or an external agent did it. Defaults to `"chat"` where omitted. */
  source?: ApprovalSource
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
  /** True when running the tool writes to the writer's data. Surfaced to MCP
   *  clients as `readOnlyHint`, which is what they confirm on. */
  mutates: boolean
  /** True when the tool can take writing away — deleting a scene, replacing a
   *  body. A stronger claim than `mutates`: an addition the writer didn't want
   *  is visible and deletable, whereas this removes something that no longer
   *  exists to be reviewed.
   *
   *  These are withheld from the in-app chat until the confirmation step of
   *  ADR 0025 exists, because that consumer has nothing that could ask first.
   *  The MCP bridge offers them: its clients prompt before running a tool, so
   *  a human is still in the loop there. */
  destructive?: boolean
  /** A short present-tense phrase naming what this call is doing —
   *  `Reading "Cats"`, `Listing scenes`. It is shown to the reader as an
   *  aside while the tool runs, so each tool words its own activity instead
   *  of the chat panel guessing a verb per tool name. */
  label(args: ToolArgs): string
  /** Names what this call would act on, in the writer's terms — a scene heading
   *  rather than an id — for the approval dialog. "Delete a scene" is not enough
   *  to answer yes or no to; "Delete \"The Briefing\"" is.
   *
   *  Only destructive entries need one, since they are the only calls that ask.
   *  Resolve to an empty string rather than throwing if the target can't be
   *  found: the dialog falls back to the label, and the handler will report the
   *  bad id properly once it runs. */
  describe?(args: ToolArgs, ctx: ToolContext): Promise<string>
  /** Runs the call and returns the text fed back to the model as the tool
   *  result. Arguments arrive parsed but unvalidated — a model can send
   *  anything — so read them defensively and answer in prose rather than
   *  throwing, which would tear down the stream mid-answer. */
  run(args: ToolArgs, ctx: ToolContext): Promise<string>
}

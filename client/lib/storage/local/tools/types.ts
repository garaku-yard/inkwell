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

/** One capability an AI consumer may invoke: the declaration providers turn
 *  into their native tool format, paired with the handler that runs it.
 *  Adding a capability is adding an entry — there is no dispatch site to
 *  edit. */
export interface ToolEntry {
  spec: ToolSpec
  /** True when running the tool writes to the writer's data. Nothing reads
   *  this yet: it is declared from the first entry because the confirmation
   *  semantics in ADR 0025 need the read/write distinction recorded per tool,
   *  not reconstructed later by guessing from tool names. */
  mutates: boolean
  /** A short label for this call, shown to the reader as an aside while the
   *  tool runs. Return "" when a call has nothing worth naming. */
  summarize(args: ToolArgs): string
  /** Runs the call and returns the text fed back to the model as the tool
   *  result. Arguments arrive parsed but unvalidated — a model can send
   *  anything — so read them defensively and answer in prose rather than
   *  throwing, which would tear down the stream mid-answer. */
  run(args: ToolArgs, ctx: ToolContext): Promise<string>
}

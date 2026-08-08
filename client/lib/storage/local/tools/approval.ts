/**
 * Human approval for destructive tool calls (ADR 0027, stage 4 of 0025).
 *
 * Until this existed, the two consumers of the registry had opposite gaps: the
 * in-app chat was denied the destructive tools outright because it had no way to
 * ask, and the MCP bridge was handed them on the assumption that its client
 * would prompt. Neither is a gate Inkwell owns.
 *
 * ## Why a broker rather than a stream frame
 *
 * The obvious reading of "the chat must ask" is to thread an approval
 * round-trip through the NDJSON contract: the tool loop emits a request, the
 * panel answers, the loop resumes. That would be the design if the loop ran
 * somewhere else — but on desktop `ragStream` and the chat panel are the same
 * webview, one process, and the stream is one-way for a reason. A module-level
 * broker gets the same result without giving the wire protocol a second job, and
 * it serves the MCP bridge too, which has no NDJSON stream to thread anything
 * through. One mechanism, both consumers, which is the shape 0025 asked for.
 *
 * The trade is that this is process-local state: it works because the desktop
 * app is a single window. A second window would have its own pending map. That
 * is true of the bridge's chosen project as well.
 */

/** Where the call came from. Shown to the writer, because "Claude Code wants to
 *  delete a scene" and "the chat wants to delete a scene" are different
 *  sentences and the second one is expected. */
export type ApprovalSource = "chat" | "mcp"

export interface ApprovalRequest {
  id: string
  /** Registry tool name, e.g. `delete_scene`. */
  tool: string
  /** The tool's own phrase for what it is about to do. */
  label: string
  /** What it will act on, named — a scene heading, not an id. Empty when the
   *  tool couldn't resolve one before asking. */
  detail: string
  source: ApprovalSource
  /** Groups requests that "don't ask again" should cover together. */
  scope: string
}

export type ApprovalOutcome = "allowed" | "denied" | "expired"

export interface ApprovalDecision {
  outcome: ApprovalOutcome
  /** A sentence for the model, so a refusal reads as an answer rather than a
   *  failure it should retry. */
  message: string
}

/** How long a request waits before denying itself. An agent call that blocks
 *  forever on an unattended machine is worse than one that is refused: the MCP
 *  client sits there, and the chat's tool loop never closes its stream. */
const APPROVAL_TIMEOUT_MS = 120_000

interface Pending {
  request: ApprovalRequest
  settle: (decision: ApprovalDecision) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Pending>()
const listeners = new Set<(requests: ApprovalRequest[]) => void>()
/** `scope::tool` entries the writer chose to stop being asked about. */
const standingAllowances = new Set<string>()

let counter = 0

function nextId(): string {
  counter += 1
  return `approval-${counter}`
}

function notify(): void {
  const snapshot = [...pending.values()].map((p) => p.request)
  for (const listener of listeners) listener(snapshot)
}

function settle(id: string, decision: ApprovalDecision): void {
  const entry = pending.get(id)
  if (!entry) return
  clearTimeout(entry.timer)
  pending.delete(id)
  entry.settle(decision)
  notify()
}

/** Asks the writer to approve one destructive call, resolving when they answer.
 *
 *  Returns immediately when the tool carries a standing allowance for its scope,
 *  which is what "don't ask again for this project" sets. */
export function requestApproval(
  input: Omit<ApprovalRequest, "id">,
): Promise<ApprovalDecision> {
  if (standingAllowances.has(`${input.scope}::${input.tool}`)) {
    return Promise.resolve({ outcome: "allowed", message: "Approved earlier." })
  }

  // No listener means no UI is mounted to answer — refuse rather than hang for
  // two minutes on a request nobody can see. This is the web build, a test, or
  // a window torn down mid-call.
  if (listeners.size === 0) {
    return Promise.resolve({
      outcome: "denied",
      message:
        `${input.tool} needs the writer's approval and nothing is available to ask. ` +
        "Nothing was changed.",
    })
  }

  const request: ApprovalRequest = { ...input, id: nextId() }
  return new Promise<ApprovalDecision>((resolve) => {
    const timer = setTimeout(() => {
      settle(request.id, {
        outcome: "expired",
        message:
          `${request.tool} was not approved within two minutes, so nothing was changed. ` +
          "Ask again if the writer still wants it.",
      })
    }, APPROVAL_TIMEOUT_MS)
    pending.set(request.id, { request, settle: resolve, timer })
    notify()
  })
}

/** Answers one pending request. `remember` sets a standing allowance for that
 *  tool within the request's scope, so a multi-step cleanup doesn't become one
 *  dialog per scene. */
export function resolveApproval(id: string, allow: boolean, remember = false): void {
  const entry = pending.get(id)
  if (!entry) return
  if (allow && remember) {
    standingAllowances.add(`${entry.request.scope}::${entry.request.tool}`)
  }
  settle(
    id,
    allow
      ? { outcome: "allowed", message: "The writer approved this." }
      : {
          outcome: "denied",
          message:
            `The writer declined ${entry.request.tool}. Nothing was changed. ` +
            "Don't try it again unless they ask.",
        },
  )
}

/** Subscribes to the pending queue. Returns an unsubscribe function. */
export function subscribeApprovals(
  listener: (requests: ApprovalRequest[]) => void,
): () => void {
  listeners.add(listener)
  listener([...pending.values()].map((p) => p.request))
  return () => {
    listeners.delete(listener)
  }
}

/** Forgets the standing allowances for one scope — what "this conversation"
 *  means when the writer clears the chat or opens another project. */
export function clearApprovalScope(scope: string): void {
  for (const key of [...standingAllowances]) {
    if (key.startsWith(`${scope}::`)) standingAllowances.delete(key)
  }
}

/** Scope string for a project's chat. */
export function chatScope(projectId: string): string {
  return `chat:${projectId}`
}

/** Scope string for the MCP bridge. Not per-project: the agent switches project
 *  with `use_project` mid-session, and an allowance granted for one project
 *  should not silently follow it into the next. */
export function mcpScope(projectId: string): string {
  return `mcp:${projectId}`
}

/** Test seam: module state outlives an individual test otherwise. */
export function __resetApprovalsForTests(): void {
  for (const entry of pending.values()) clearTimeout(entry.timer)
  pending.clear()
  listeners.clear()
  standingAllowances.clear()
  counter = 0
}

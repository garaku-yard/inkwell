import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  __resetApprovalsForTests,
  chatScope,
  mcpScope,
  clearApprovalScope,
  requestApproval,
  resolveApproval,
  subscribeApprovals,
  type ApprovalRequest,
} from "@/lib/storage/local/tools/approval"

/** A mounted UI, in the one respect the broker cares about: something is
 *  listening, so requests queue instead of refusing themselves. */
function mountListener(): { seen: ApprovalRequest[][]; unsubscribe: () => void } {
  const seen: ApprovalRequest[][] = []
  const unsubscribe = subscribeApprovals((queue) => seen.push(queue))
  return { seen, unsubscribe }
}

const base = {
  tool: "delete_scene",
  label: "Deleting a scene",
  detail: 'Delete "The Briefing" and its 4 elements',
  source: "chat" as const,
  scope: chatScope("p1"),
}

beforeEach(() => {
  __resetApprovalsForTests()
})

afterEach(() => {
  __resetApprovalsForTests()
  vi.useRealTimers()
})

describe("approval broker", () => {
  it("holds the call until the writer answers, then allows it", async () => {
    const { unsubscribe } = mountListener()
    const pending = requestApproval(base)

    // Nothing has resolved yet — this is the whole point, the handler has not run.
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    resolveApproval("approval-1", true)
    await expect(pending).resolves.toMatchObject({ outcome: "allowed" })
    unsubscribe()
  })

  it("denies with a sentence the model can act on rather than a bare false", async () => {
    const { unsubscribe } = mountListener()
    const pending = requestApproval(base)
    resolveApproval("approval-1", false)

    const decision = await pending
    expect(decision.outcome).toBe("denied")
    // The result is fed back into the conversation as the tool's output, so it
    // has to read as an answer — not as an error worth retrying.
    expect(decision.message).toContain("declined")
    expect(decision.message).toContain("Nothing was changed")
    unsubscribe()
  })

  it("refuses immediately when no UI is mounted to ask", async () => {
    // The web build, a test, or a window torn down mid-call. Hanging for the
    // full timeout on a question nobody can see is the worse failure.
    const decision = await requestApproval(base)
    expect(decision.outcome).toBe("denied")
    expect(decision.message).toContain("nothing is available to ask")
  })

  it("expires rather than blocking the tool loop forever", async () => {
    vi.useFakeTimers()
    const { unsubscribe } = mountListener()
    const pending = requestApproval(base)

    vi.advanceTimersByTime(120_000)
    const decision = await pending
    expect(decision.outcome).toBe("expired")
    expect(decision.message).toContain("two minutes")
    unsubscribe()
  })

  it("stops asking once the writer says not to, within that scope only", async () => {
    const { unsubscribe } = mountListener()
    const first = requestApproval(base)
    resolveApproval("approval-1", true, true)
    await expect(first).resolves.toMatchObject({ outcome: "allowed" })

    // Same tool, same scope — no dialog, no listener notification needed.
    await expect(requestApproval(base)).resolves.toMatchObject({
      outcome: "allowed",
      message: "Approved earlier.",
    })

    // A different tool in the same scope still asks...
    const other = requestApproval({ ...base, tool: "rewrite_scene" })
    resolveApproval("approval-2", false)
    await expect(other).resolves.toMatchObject({ outcome: "denied" })

    unsubscribe()
  })

  it("does not let a chat allowance cover the MCP bridge", async () => {
    const { unsubscribe } = mountListener()
    const first = requestApproval(base)
    resolveApproval("approval-1", true, true)
    await first

    // Same tool and project, different consumer: an allowance granted to the
    // writer's own chat must not silently arm an external agent.
    const viaBridge = requestApproval({
      ...base,
      source: "mcp",
      scope: mcpScope("p1"),
    })
    resolveApproval("approval-2", false)
    await expect(viaBridge).resolves.toMatchObject({ outcome: "denied" })
    unsubscribe()
  })

  it("forgets standing allowances when the conversation ends", async () => {
    const { unsubscribe } = mountListener()
    const first = requestApproval(base)
    resolveApproval("approval-1", true, true)
    await first

    clearApprovalScope(chatScope("p1"))

    const after = requestApproval(base)
    resolveApproval("approval-2", false)
    await expect(after).resolves.toMatchObject({ outcome: "denied" })
    unsubscribe()
  })

  it("queues concurrent calls so each is answered on its own", async () => {
    const { seen, unsubscribe } = mountListener()
    const a = requestApproval(base)
    const b = requestApproval({ ...base, tool: "rewrite_scene" })

    // A model can emit several tool calls in one turn; both must be pending
    // rather than one silently overwriting the other.
    expect(seen[seen.length - 1]).toHaveLength(2)

    resolveApproval("approval-2", true)
    await expect(b).resolves.toMatchObject({ outcome: "allowed" })
    expect(seen[seen.length - 1]).toHaveLength(1)

    resolveApproval("approval-1", false)
    await expect(a).resolves.toMatchObject({ outcome: "denied" })
    unsubscribe()
  })

  it("ignores an answer to a request that is already settled", async () => {
    const { unsubscribe } = mountListener()
    const pending = requestApproval(base)
    resolveApproval("approval-1", true)
    await pending
    // A double-click on Allow, or a dialog closing after its own button ran.
    expect(() => resolveApproval("approval-1", false)).not.toThrow()
    unsubscribe()
  })
})

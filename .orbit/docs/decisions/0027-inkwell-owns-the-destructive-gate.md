# 0027 — Inkwell owns the gate in front of destructive tool calls

**Status:** Accepted · 2026-08-09

Completes stage 4 of [0025](./0025-one-tool-registry-two-consumers.md), whose
"mutating tools are declared as such *and confirmed*" shipped only as the first
half.

## Context

0025 made tools data in one registry with two consumers, and said a mutating tool
must be declared and confirmed. Declaration landed; confirmation did not. What
shipped instead was a split that the code itself called a stopgap:

- The **in-app chat** was denied every `destructive` entry by `toolSpecsFor`,
  because the tool loop had no way to ask a human anything mid-stream. The writer
  could not ask their own assistant to delete a scene they no longer wanted.
- The **MCP bridge** was handed the full set, on the reasoning that its clients
  prompt before running a tool.

The second half of that is the weaker claim. It makes an external program's good
manners load-bearing for whether a manuscript survives, and it is not a property
Inkwell can check. The endpoint's real defence is the token and the loopback
bind — but any process on the machine that reads the 0600 handshake file gets a
tool list with `delete_scene` in it and no further questions asked. "The client
will prompt" is an assumption about a client, not a gate.

Confirmation also does not cover the failure that actually costs words. The
expensive case is not the call the writer refuses; it is the one they approve,
where the model then rewrites a scene into something they did not want. No dialog
prevents that.

## Decision

**Inkwell asks, for both consumers, through one broker — and keeps what it
removed.**

A module-level approval broker (`lib/storage/local/tools/approval.ts`) holds a
pending queue. `ragStream` and the MCP bridge both `await requestApproval(...)`
before running any entry marked `destructive`, and a single app-wide dialog
answers for both. `toolSpecsFor` no longer filters: the gate moved from *which
tools exist* to *what happens before one runs*, which is where it belonged.

**A broker, not a stream frame.** The obvious reading of "the chat must ask" is
to thread an approval round-trip through the NDJSON contract — the loop emits a
request, the panel answers, the loop resumes. That is the design if the loop runs
elsewhere. On desktop `ragStream` and the panel are one process in one webview,
and the bridge has no NDJSON stream at all, so a wire-protocol change would serve
one consumer and not the other. The broker serves both and leaves the stream
one-way.

**An undo journal, because approval is not recovery.** Every destructive tool
already soft-deletes: `scenes.delete` cascades `deleted_at` to the scene's
elements, and `rewrite_scene` removes the old elements only after committing the
replacement. The rows survive; what was missing was a record of *which* rows a
given call touched. Migration 0016 adds `agent_undo`, one row per destructive
call, holding the ids to restore and the ids to remove. "Recent AI changes"
replays it.

Three properties are part of this decision:

- **A pending request times out and denies itself** (two minutes). An agent call
  that blocks forever on an unattended machine is worse than a refused one: the
  MCP client hangs and the chat's tool loop never closes its stream.
- **No listener means refuse, immediately.** A request nobody can see must not
  wait out the timeout.
- **Undo is not a tool.** An agent that has just done the wrong thing is the
  wrong thing to depend on to reverse it. It is reachable only from the UI.

## Alternatives considered & why not

- **Keep trusting the MCP client to prompt.** Cheapest, and Claude Code does
  prompt. Rejected: it is an assumption about someone else's software, it fails
  open for any other token holder, and it leaves the chat permanently unable to
  delete anything — the asymmetry 0025 flagged as a stopgap.
- **Thread approval through the NDJSON stream.** The design the task assumed.
  Rejected above: it gives the wire protocol a second job to serve one of two
  consumers.
- **A setting to disable confirmation.** Rejected for now. It would be a switch
  whose only function is to remove the gate this ADR exists to add, and the
  standing "don't ask again for this tool in this project" allowance already
  covers the case it was wanted for — a multi-step cleanup that would otherwise
  be one dialog per scene. Revisit if driving long refactors from Claude Code
  proves it insufficient.
- **Hard-delete with a confirmation instead of soft-delete plus undo.**
  Rejected: the rows are already soft-deleted for sync's sake, so recovery costs
  a journal rather than a storage change. Confirmation alone would leave the
  approved-and-regretted case with nothing.
- **Journal the whole previous body rather than row ids.** Rejected: the bodies
  are already on disk under `deleted_at`, so storing them again would be a second
  copy that can disagree with the first.

## Consequences

- **The chat can now delete and rewrite**, which it could not before. That is a
  capability increase gated on a human answer, not a loosening.
- **A destructive MCP call now blocks on a dialog in the app.** An agent driving
  Inkwell headlessly will stall for two minutes and then be refused. Accepted:
  the app must be running for MCP to work at all (0025), so a window exists to
  answer in.
- **Two prompts for one deletion** when the MCP client also asks. Left alone —
  duplicated care on the one irreversible action is not the failure mode worth
  optimising away.
- **The broker is process-local.** It works because the desktop app is a single
  window; a second window would keep its own queue. The bridge's chosen project
  already has this property.
- **`agent_undo` never syncs.** No write to it calls `markDirty`, so it stays on
  the device that made the change — replaying one device's undo against another's
  rows would be meaningless. The restore itself *does* mark the restored rows
  dirty, so the outcome propagates even though the journal does not.
- **Undo is per call, not a stack.** Entries are independent; undoing an older
  one does not rewind the newer ones on top of it.

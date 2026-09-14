# 0032 — The gateway owns the hosted tool loop

**Status:** Accepted  
**Date:** 2026-09-14  
**Scope:** hosted chat, AI provider adapters, and gateway application operations

Extends the hosted-build consequence of
[0025](./0025-one-tool-registry-two-consumers.md) and applies the destructive
gate from [0027](./0027-inkwell-owns-the-destructive-gate.md) across a network
boundary.

## Context

Desktop chat already has a four-turn agent loop. Its TypeScript registry pairs
provider declarations with handlers over local `Storage`, and the Tauri MCP
bridge consumes the same entries. Hosted chat has a different path: the gateway
resolves a BYO or managed provider, opens one `server/pkg/aiadapter` stream, and
forwards text as NDJSON. The Go adapters do not represent tool declarations,
tool calls, assistant tool-call turns, or tool results.

Copying the TypeScript handlers into Go would create two definitions of an
operation such as `create_scene`. Calling the gateway's own HTTP endpoints would
avoid that copy only by adding an internal HTTP hop and rebuilding the user's
authentication context. Calling gRPC directly from each tool would still copy
the validation, role resolution, request mapping, and error semantics currently
embedded in HTTP handlers.

The desktop registry also contains two capabilities the hosted build cannot
satisfy. `search_notes` and `read_note` inspect vault files and embeddings on the
writer's device; the hosted services neither store nor index that local vault.

Finally, desktop destructive approval is an in-process broker. A hosted loop
runs in a gateway replica while the writer answers from a browser request that
may reach another replica. Holding an in-memory promise, or assuming a sticky
connection, would strand approvals on restart and make routing part of the
safety boundary.

## Decision

### The loop lives in the gateway

The gateway owns hosted tool orchestration. It already authenticates the actor,
resolves provider credentials, applies managed-AI quotas, owns every downstream
gRPC client, streams the public NDJSON response, and owns cross-service project
authorization under [0029](./0029-gateway-application-gateway-service-authorities.md).

AI-settings remains a credential and provider-configuration service. It must not
gain scripts, workspace, or collaboration dependencies merely because it stores
the model key.

The loop is a package used by the AI HTTP handler, separate from provider
adapters and tool executors. Like desktop it permits at most four provider turns.
Cancellation closes the current upstream stream and stops execution. Unknown
tools and invalid arguments become tool results the model can correct; transport,
authorization, and service failures remain explicit failures.

### Contracts are language-neutral; execution remains native

A versioned checked-in manifest is the canonical contract for every tool that
can exist on both surfaces. It contains the stable name, description, JSON input
schema, scope, mutation class, and availability. CI generates or validates the
Go provider declarations and TypeScript `ToolSpec`s from that manifest, so the
model cannot be shown different argument shapes by the two loops.

Handlers are intentionally not shared across languages. Desktop handlers keep
calling local `Storage`. Hosted handlers call gateway application operations.
Those operations are extracted from the existing HTTP handlers and own input
validation, role resolution, gRPC mapping, and public error classification.
HTTP endpoints and tools become two transports over those operations. A hosted
tool must not call a generated service client through a parallel policy path.

Tool results use stable JSON objects internally and are serialized to compact
text for providers. IDs needed by a later call remain present; human labels do
not replace them.

### Hosted capability is a deliberate subset

The first hosted set is:

| Stage | Tools | Behavior |
|---|---|---|
| Read | `list_projects`, `list_scenes`, `read_scene` | Available once the bounded loop ships |
| Write | `create_project`, `create_scene`, `append_to_scene`, `add_beat`, `rename_scene` | Uses existing project/org policy and idempotent execution |
| Destructive | `rewrite_scene`, `delete_scene` | Available only after durable approval and recovery ship |
| Desktop only | `search_notes`, `read_note` | Never declared by hosted chat while vault knowledge remains device-local |

The manifest marks surface availability so omission is explicit. Hosted chat
does not emulate vault access with incomplete server data.

Read support is a launch requirement for hosted chat rather than something to
defer until users arrive. Non-destructive writes may land after the read loop is
stable. Destructive tools are the final stage and must not be declared early.

### Provider tool use is part of `aiadapter`

`aiadapter.Input` gains normalized tool declarations and messages gain assistant
tool calls plus tool results. Stream chunks gain assembled tool calls and a stop
reason. Each provider adapter owns only its wire conversion, including streamed
argument fragments; the gateway loop owns iteration and execution.

Managed-token usage is accumulated across every provider turn in the loop and
recorded once for the hosted request. Existing BYO behavior remains unmetered.
The request correlation ID is logged on each provider turn and tool execution,
with tool name, duration, outcome, and stable tool-call ID. Arguments and tool
results are not logged because they may contain manuscript text.

### Writes are idempotent; destructive calls pause durably

Every hosted mutating call has an idempotency key derived from the authenticated
request and provider tool-call ID. The service that owns the mutation atomically
records the key and result in the same database transaction, so retrying a
provider turn cannot create a second scene or append the same text twice.

For a destructive call the gateway does not wait on an in-memory broker. It
persists an opaque, expiring checkpoint containing the actor, project, normalized
call, provider conversation state, correlation ID, and idempotency key. The
stream emits an `approval_required` NDJSON frame and ends in a paused state.
The client answers through an authenticated approve/deny endpoint.

Approval atomically consumes the checkpoint, verifies the same actor and
project, re-resolves authorization, and resumes the loop. Denial, expiry,
replay, an authorization change, or a missing checkpoint fails closed. The
checkpoint store is shared by replicas and survives a gateway restart; sticky
sessions are not a correctness mechanism. Executed destructive calls also write
a hosted audit/undo record before the loop continues.

The checkpoint format is server-owned and opaque to clients. It is versioned so
deployments can reject an incompatible paused turn cleanly rather than execute
partially understood state. Checkpoint payloads are encrypted at rest and expire
promptly because arguments and conversation state can contain manuscript text.

## Delivery

The implementation is split into ordered Orbit tasks:

1. [#368](https://orbit.garakuyard.com/?task=368) defines the shared contract and
   extracts reusable authorization-aware gateway operations.
2. [#369](https://orbit.garakuyard.com/?task=369) adds provider tool-call support
   and the bounded read-only hosted loop.
3. [#370](https://orbit.garakuyard.com/?task=370) enables idempotent,
   non-destructive hosted writing tools.
4. [#371](https://orbit.garakuyard.com/?task=371) adds durable approval,
   destructive execution, audit, and recovery.

Each stage adds adapter fixtures and boundary tests at the service interaction
it introduces. The read loop can ship independently; later stages only add
entries to the declared hosted set after their gates exist.

## Rejected alternatives

- **Put the loop in AI-settings.** Provider credential custody does not make
  that service the application orchestrator. It would reverse dependency
  direction and duplicate gateway authorization.
- **Run a second internal HTTP client from the gateway to itself.** This adds
  serialization and routing while reconstructing authentication the current
  request already has.
- **Let every Go tool call gRPC directly.** HTTP handlers and tools would drift
  in validation, authorization, and error behavior.
- **Generate executable handlers across Go and TypeScript.** Only the provider
  contract is portable; local SQLite and hosted gRPC execution have deliberately
  different dependencies.
- **Declare all desktop tools and return “unavailable” for vault calls.** Dead
  tools consume model attention and imply hosted access to absent data.
- **Keep an approval request open in one gateway process.** A replica restart or
  load-balancer route would lose the decision, and safety cannot depend on
  sticky sessions.
- **Ship destructive tools with client-side confirmation alone.** A client
  convention is not a server-enforced gate.

## Consequences

- Hosted and desktop chats share tool names and schemas, while each executes
  through the storage boundary appropriate to its surface.
- The gateway gains an application-operation layer and a bounded orchestration
  loop but does not become the authority for scripts data or org membership.
- Hosted vault knowledge remains unavailable until a separate decision gives
  the server an honest source for that data.
- Multi-replica deployment needs a shared checkpoint/idempotency store before
  destructive tools can ship.
- The existing NDJSON contract grows additive `tool`, `approval_required`, and
  paused terminal frames; plain text clients continue to receive `response`,
  `done`, and `error` frames during the read and non-destructive stages.

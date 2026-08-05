# 0025 — One tool registry, two consumers: the in-app chat and an MCP bridge

**Status:** Accepted · 2026-08-05

## Context

The desktop chat already runs an agentic tool loop. `ragStream`
(`client/lib/storage/local/ai.ts`) declares tools on each turn, collects
`toolCall`s off the stream, executes them, appends the results to the
conversation and iterates up to `MAX_TOOL_ITERATIONS` (4). All three provider
adapters — Anthropic, OpenAI, Gemini — already map `ToolSpec` into their native
tool declarations, and `stopReason: "tool_use"` is plumbed end to end.

What that loop can *do* is one thing: `read_note`, fetched by title from the
project's knowledge scope, dispatched by a literal `if (call.name ===
"read_note")` with an `Unknown tool` fallback. The machinery is general; the
capability is a single hard-coded branch.

Separately, the maintainer wants to drive Inkwell from an external agent — run
operations against the open editor from Claude Code. Those are the same
operations the chat would want: list projects, read and write scenes, search the
vault, add a beat. Two consumers, one capability surface, and today neither can
reach it.

Note the asymmetry this starts from: the **server has no tool loop at all**. The
web build's chat goes through the gateway's BYO endpoint, which streams
completions and nothing else. Tool use is a desktop-only property today.

## Decision

**Tools become data in one registry, defined in TypeScript over the `Storage`
interface, with two consumers.**

Each entry pairs a `ToolSpec` (the declaration providers already understand) with
a handler that calls `Storage`. `ragStream` stops branching on tool names and
dispatches through the registry, so adding a capability is adding an entry rather
than editing a conditional.

The second consumer is an **MCP bridge hosted inside the Tauri app**, reachable
on a loopback endpoint, with a thin stdio shim forwarding an external MCP client
to it. The bridge exposes the same registry — not a parallel set of operations.

Two properties are part of the decision, not follow-ups:

- The endpoint binds `127.0.0.1` and requires a token. It offers read *and write*
  access to everything the user has written; an unauthenticated local port is a
  standing invitation to any process on the machine.
- Mutating tools are declared as such and confirmed. An agent that can silently
  rewrite a scene is a different proposition from one that can read it, and the
  registry is where that distinction is recorded.

## Alternatives considered & why not

- **A standalone MCP server reading `inkwell.db` directly.** Tempting because it
  would work with the app closed. Rejected: `lib/storage/local/*` reaches SQLite
  through `@tauri-apps/plugin-sql`, which exists only inside a Tauri webview, so
  that process would need its own driver and a second implementation of every
  operation — the exact duplication [0004](./0004-storage-abstraction.md) exists
  to prevent. It would also write behind the running app's back, leaving the
  editor showing stale rows.
- **Implement the MCP tools in Rust inside `src-tauri`.** Rejected for the same
  reason from the other end: the chat's tools are TypeScript over `Storage`, so
  this yields two definitions of "create a scene" that must be kept in step.
- **Expose the gateway REST API as the MCP surface.** Rejected: the writing lives
  in local SQLite and nothing is deployed
  ([0001](./0001-local-first-architecture.md)), so a gateway-backed MCP would
  faithfully report an empty account.
- **Keep extending the `if`-chain.** Rejected: the rule-of-three threshold is met
  the moment a second tool lands, and an external consumer cannot reach a
  conditional buried in a stream handler at all.

## Consequences

- **The app must be running for MCP to work.** Accepted deliberately — the point
  is to act on the editor that is open. An offline-capable variant would mean the
  standalone server rejected above.
- **The in-app chat gains real capability as a side effect** rather than as
  separate work. Every tool added for the external agent is one the writer's own
  chat can use, which is the main reason to build it this way round.
- **This stays desktop-only.** The gateway runs no tool loop, so the web chat
  gains nothing here; giving it tools later means a Go implementation of the
  registry, and this ADR deliberately does not sketch one — two implementations
  is the thing being avoided, and the hosted build has no users yet
  ([0020](./0020-monetization-open-core-paddle.md)).
- **A new local attack surface exists** that did not before. Token plus loopback
  binding is the floor, not the finished story; anything that broadens it (a
  non-loopback bind, a shared token) deserves its own decision.
- BYO-key AI ([0008](./0008-byo-key-ai-only.md)) is unchanged: the registry
  supplies tools, the user's own provider key still drives the model, and tool
  execution stays on the device.

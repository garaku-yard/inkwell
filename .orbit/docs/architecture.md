# Architecture

> The real structural mental model: the two halves, their components, how data
> flows, and where the load-bearing boundaries are. Derived from the code and
> the contributor tour in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Two halves that run independently

```
┌─────────────────────────┐          ┌────────────────────────────┐
│      Desktop app        │          │  Optional hosted stack     │
│   (Tauri v2 + Next.js)  │          │   (self-host or ignore)    │
│                         │          │                            │
│  CodeMirror 6 editors   │  ⇄ HTTP  │  api-gateway (HTTP :8080)  │
│  SQLite + .md files     │  cookie  │     ├─ identity-service    │
│  Local-first storage    │  /token  │     ├─ scripts-service     │
│  BYO-key AI (keychain)  │   auth   │     ├─ collab-service      │
│                         │          │     ├─ billing-service     │
│                         │          │     ├─ workspace-service   │
│                         │          │     ├─ aisettings-service  │
│                         │          │     └─ notifications-svc   │
│                         │          │  Postgres / Redis / Kafka  │
└─────────────────────────┘          └────────────────────────────┘
```

The **desktop app** is the primary surface and is fully local-first: it reads
and writes local SQLite + on-disk files and reaches the gateway **only** when a
user opts into an account + cloud sync. The **hosted stack** is a second half
you self-host or skip. The same Next.js frontend runs in both — bundled by Tauri
for desktop, served directly for web. This split is the foundational decision:
[decisions/0001](./decisions/0001-local-first-architecture.md),
[0002](./decisions/0002-tauri-not-electron.md).

## Client (`client/`)

Next.js 15 (React 19, TypeScript, Tailwind v4, shadcn/ui) statically exported and
wrapped in Tauri v2 (Rust) for desktop. CodeMirror 6 with a custom Lezer
decoration plugin powers the Obsidian-style live-preview markdown.

### The storage abstraction — the frontend keystone

`client/lib/storage/` is one `Storage` interface with two implementations, bound
at boot:

| File | Role |
|---|---|
| `index.ts` | The interface + sub-interfaces (auth, projects, scenes, elements, characters, locations, beatBoard, workspaces, collaboration, settings, vault, ai, sync, admin) + the `Capability` union + `getStorage()`/`setStorage()`. |
| `local/` | SQLite + filesystem (Tauri). Vault notes are real `.md` files; everything else is SQLite. |
| `remote/` | HTTP implementation wrapping every gateway endpoint (web build). |
| `StorageProvider.tsx` | Detects `isTauri()` at boot and binds the right impl before children render. |

Every `services/*.ts` file delegates through `getStorage()`, so a component
**never branches on platform** and the local build can shim anything the backend
lacks. Rationale: [decisions/0004](./decisions/0004-storage-abstraction.md).

### Editors

`EditorFactory` routes on `project.category`. All eight non-vault formats render
on **shared page primitives** — `lib/editor/paginate.ts` +
`components/editor/shared/PagedSheets.tsx` (discrete A4 sheets on a desk with a
margin tool rail; screenplay rides the same surface at US-Letter geometry via a
`pageSize` prop, because its page count is semantic). Reusable machinery is kept
minimal and each editor owns its config — the **engine + per-format config**
pattern, deliberately chosen over a single `<BaseEditor>`:
[decisions/0012](./decisions/0012-engine-plus-config-over-baseeditor.md).
Canonical examples: `lib/editor/keymap.ts` (engine) +
`components/editor/screenplay/keymap.ts` (config);
`components/editor/shared/StableContentEditable.tsx`.

The **vault** editor is its own world (CodeMirror 6 + Lezer live-preview,
wikilinks, backlinks, watcher, graph, tags), decomposed into co-located
hooks + render components under `components/editor/vault/`.

### Desktop shell (`client/src-tauri/`)

Rust crate `inkwell`. Owns SQLite migrations (`migrations/0001…`, registered in
`src/lib.rs`), the OS-keychain bridge for BYO keys (`src/secrets.rs`), the
`.fdx` open-file handler (`src/open_file.rs`), a frameless transparent themed
window (`decorations: false` — [decisions/0005](./decisions/0005-frameless-themed-titlebar.md)),
and capability grants (`capabilities/default.json`).

## Server (`server/`)

Go microservices over gRPC behind a chi HTTP gateway.

### Gateway (`server/internal/gateway/`)

**Not a service** — a thin HTTP↔gRPC proxy. It authenticates (JWT → identity +
Redis blocklist), enforces per-user + per-route rate limits, sets CSP/security
headers, and routes to services through a `grpcclient` registry with
`sony/gobreaker` circuit breakers. Handlers use the `Endpoint[Req,Resp]` +
`Wrap()` helper to collapse method-guard/auth/decode/call/error boilerplate.
Sub-resource mutations (beats/lanes/connections/outline items/elements) are
authorized against the resource's **real** owning project
(`GetResourceProject` → `ResolveProjectAccess`), never a client-supplied id.
[decisions/0007](./decisions/0007-gateway-thin-proxy-db-per-service.md).

### Services

Each service is identical in shape — `domain/` (structs + error sentinels),
`repository/` (interface + `postgres_repository.go`), `service/` (business logic
on the repo interface + `outbox.Store` + `events.Publisher` + `quota.Client`),
`handler/` (gRPC ↔ domain), `config/`, `migrations/`. Each **owns its own
database**; cross-service reads go through gRPC.

| Service | gRPC | Owns | Kafka |
|---|---|---|---|
| identity | :50051 | users, sessions, JWT, 2FA | emits `user.created` |
| scripts | :50052 | projects, scenes, elements, beats, lanes, connections, outline items, `vault_files`; cloud sync | emits `project.created/deleted` |
| collab | :50053 | collaborators, invitations, comments, presence, edit_sessions | emits `collab.added`, `comment.added`, `collaboration.invited` |
| billing | :50054 | subscription tiers, subscriptions, gateways, usage | emits `billing.updated` |
| workspace | :50056 | workspaces, organizations, categories, members | — |
| aisettings | :50057 | `user_ai_providers` (encrypted BYO keys) | — |
| notifications | :50058 | prefs, in-app feed, delivery log | **consumes** user/collab/comment events → in-app + email |

### Shared Go packages (`server/pkg/`)

`apierror` (structured error envelope every gateway response uses) ·
`aiadapter` (server mirror of the client provider adapters, with error
redaction) · `crypto` (AES-256-GCM with associated-data binding) · `outbox`
(transactional outbox store + poller) · `quota` (usage vocabulary +
`Checker`/`Tracker` + `Require`) · `events` (Publisher + Kafka/Noop) · `redis`
· `kafka` · `database` · generated gRPC stubs.

### Infrastructure

PostgreSQL (one DB per service, ports 5432–5438), Redis (JWT blocklist +
fixed-window rate limiting), Kafka + Zookeeper (async domain events via the
outbox). All in `docker-compose.yml`; see [runbook.md](./runbook.md).

## Cross-cutting flows

- **Auth.** Web uses cookie/JWT with a CSRF-safe Origin check. Desktop uses
  **token auth**: the gateway returns the JWT in-body for
  `X-Inkwell-Client: desktop`, stored in the OS keychain and replayed as
  `Authorization: Bearer`; token clients are CORS/CSRF-exempt so the webview's
  `tauri://localhost` origin works. Desktop login is optional — never a forced
  gate ([decisions/0017](./decisions/0017-optional-desktop-login.md)).
- **BYO AI dispatch.** Desktop dispatches in the webview via
  `client/lib/ai/providers/` (gateway never involved). Hosted decrypts inside
  `aisettings-service.GetForDispatch` just before the gateway invokes
  `pkg/aiadapter`. `openai_compatible` is gated by an operator allowlist
  ([decisions/0009](./decisions/0009-openai-compatible-allowlist.md)).
- **Cloud sync** (opt-in, desktop). Two engines: a **row engine** (DB-backed
  projects, UUID-keyed, incremental `sync_outbox` push, LWW) and a **path-keyed
  vault engine** (markdown + binary attachments). Both mirror an
  apply-then-pull-excluding-pushed contract with a single server clock. Full
  mechanics: [reference/sync-engine.md](./reference/sync-engine.md).
- **Real-time co-editing.** WebSocket transport with per-project room hubs,
  Redis cross-instance fan-out, presence roster, remote carets, and durable
  `edit_sessions`. Element edits are LWW; CRDT is deferred
  ([decisions/0019](./decisions/0019-realtime-tiered-lww-then-crdt.md)).

## Boundaries worth respecting

- **`getStorage()`, not `isTauri()` in components.** Platform choice happens once.
- **One DB per service; gRPC for cross-service reads.** No shared tables.
- **Server migrations are append-only; client SQLite migrations too** (and must
  be registered in `src-tauri/src/lib.rs`). Never edit a shipped migration.
- **Generated files (`*.pb.go`) are regenerated from proto** — never hand-edit.
- **`markDirty` on every new `local/*` mutation** or the edit silently never
  syncs (the apply path deliberately does not).

For contribution flow, the four-layer service recipe, and the PR checklist, see
[CONTRIBUTING.md](../../CONTRIBUTING.md); the conventions letter is in
[conventions.md](./conventions.md).

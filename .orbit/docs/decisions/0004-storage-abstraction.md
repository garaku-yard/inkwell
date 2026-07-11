# 0004 — One `Storage` interface, local + remote implementations

**Status:** Accepted

## Context

Local-first ([0001](./0001-local-first-architecture.md)) with one shared frontend
means the same React code must persist to **local SQLite + filesystem** on desktop
and to the **HTTP gateway** on web. Something has to hide that difference.

## Decision

Define a single `Storage` interface (`client/lib/storage/index.ts`) with
sub-interfaces per domain (auth, projects, scenes, elements, characters,
locations, beatBoard, workspaces, collaboration, settings, vault, ai, sync,
admin) and two implementations: `local/` (SQLite + FS, Tauri) and `remote/`
(gateway HTTP, web). `StorageProvider` detects `isTauri()` once at boot and binds
the right impl before children render. Every `services/*.ts` file delegates
through `getStorage()`. Optional features are expressed as a `Capability` union
(`auth`, `collaboration`, `realtime`, `admin`, `ai.byo`, `ai.knowledge`, `sync`)
so the UI can hide what isn't bound.

## Alternatives considered & why not

- **Branch on platform inside components** (`if (isTauri()) …`). Rejected:
  platform logic sprawls across the whole component tree and every new feature
  re-litigates it.
- **Two frontends, one per surface.** Rejected: duplicate everything — the
  opposite of "one page everywhere."
- **Assume the backend is always present.** Rejected: the local build must run
  with no server, so the abstraction must let `local/` shim anything the gateway
  offers.

## Consequences

- Components call services, services call `getStorage()` — **never `isTauri()` in
  a component** and never `fetch` in a component.
- Capabilities gate optional UI; the same code renders more or less depending on
  what the bound impl supports.
- The local impl can implement features (vault, keychain, sync outbox) the remote
  impl legitimately cannot, and vice versa.

# 0001 — Local-first architecture; hosted stack optional

**Status:** Accepted

## Context

Serious writing tools force a trade: a cloud document that needs an account and a
network and owns your work, or a local silo per format. A writer wants their
draft on their own disk, openable offline, interoperable with the plain files
they already trust — but collaboration and cross-device sync still need a server
somewhere.

## Decision

Ship **local-first by default**: the desktop app stores everything on the user's
machine (projects/beat boards/analytics in SQLite; vault notes as real `.md`
files; AI keys in the OS keychain) and needs no account and no network. A
**hosted stack** (Go microservices over gRPC + Postgres/Redis/Kafka) exists
alongside it as an **optional** layer for collaboration, sync, and multi-tenant
workspaces — fully self-hostable, skippable by most users. The same Next.js
frontend serves both surfaces.

## Alternatives considered & why not

- **Server-first SaaS.** Rejected: forces an account + network gate, puts the
  writer's data on someone else's server, and contradicts the product's north
  star (quiet craft, writer owns the draft).
- **Pure-local, no server at all.** Rejected: leaves no path to collaboration or
  cross-device sync, both of which real users want *sometimes* without wanting
  them *always*.
- **Two separate apps (a local one and a cloud one).** Rejected: duplicate
  frontends; the optional-second-half model gets the same code to both.

## Consequences

- Requires the storage abstraction ([0004](./0004-storage-abstraction.md)) so one
  frontend runs on SQLite/FS (desktop) or HTTP (web).
- Sync ([0013](./0013-sync-client-uuid-lww.md)) and login
  ([0017](./0017-optional-desktop-login.md)) are opt-in bolt-ons, never gates.
- The desktop build is the primary surface; the hosted stack is secondary.
- Enables the open-core monetization posture
  ([0020](./0020-monetization-open-core-paddle.md)): the local app is free, the
  hosted convenience is the paid product.

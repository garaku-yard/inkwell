# Sync Engine — moved

> **This document moved into the Orbit docs spine.**
>
> Canonical location: [`.orbit/docs/reference/sync-engine.md`](./.orbit/docs/reference/sync-engine.md)
> Design decisions: [`.orbit/docs/decisions/`](./.orbit/docs/decisions/) —
> [0013 (client-UUID + LWW)](./.orbit/docs/decisions/0013-sync-client-uuid-lww.md),
> [0014 (incremental outbox push)](./.orbit/docs/decisions/0014-sync-incremental-outbox.md),
> [0015 (time-based tombstone GC)](./.orbit/docs/decisions/0015-sync-time-based-gc.md).

This redirect stub is intentionally kept at the repo root: ~20 source comments
(Go, TypeScript, proto, and **shipped SQL migrations** + a **generated `.pb.go`**)
cite `SYNC_DESIGN.md` by path, and those files must not be edited (generated code
is regenerated from proto; shipped migrations are immutable history). The stub
keeps every one of those references resolving. New references should point at the
canonical spine doc above.

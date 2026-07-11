# 0013 — Sync: client-UUID authoritative, LWW, opt-in, DB-backed only

**Status:** Accepted · locked 2026-06-20

## Context

Cloud sync ([0001](./0001-local-first-architecture.md)) has to reconcile a
device's local SQLite with the cloud `scripts-service`. Local PKs were already
client `crypto.randomUUID()` TEXT, designed to map one-to-one with the cloud — but
the server called `uuid.New()` and ignored client ids, and neither side could
detect change or deletion (no version/dirty column; `updated_at` missing on
several tables; child deletes were hard deletes).

## Decision

- **Client UUID is authoritative** — the server upserts by client-supplied id.
- **Bidirectional** true two-way delta sync (not one-way backup first).
- **Opt-in per project** — only flagged projects leave the device.
- **DB-backed projects only** — vault (files) is a separate engine
  ([0006](./0006-vault-notes-as-files.md)).
- **Last-sync-wins** on a **single authoritative clock** — the server stamps
  `updated_at = NOW()` on every upsert; the delta cursor is server time; the
  client's local `updated_at` is display-only, overwritten on pull.
- Tombstones (`deleted_at`) on every synced table for delete propagation.

## Alternatives considered & why not

- **A local↔remote id-mapping table** instead of client-authoritative UUIDs.
  Rejected: brittle and FK-hostile — every relation would need translation.
- **One-way backup first, sync later.** Rejected: the goal is genuine
  multi-device editing, not just a cloud copy (that's the separate Drive backup,
  [0021](./0021-drive-backup-google-only.md)).
- **CRDT-grade merge.** Deferred to real-time co-editing
  ([0019](./0019-realtime-tiered-lww-then-crdt.md)); overkill for
  single-user-multi-device.
- **Client-clock ordering.** Rejected: clock skew across devices makes it
  unreliable; one server clock sidesteps it.

## Consequences

- Requires tombstones + `updated_at` everywhere and an **apply-then-pull**
  protocol (convergent where pull-then-apply is not).
- "Last sync wins" is not "last edit wins" for true offline-concurrent single-row
  edits — documented and accepted for this audience.
- The push mechanism itself needed a correction — see
  [0014](./0014-sync-incremental-outbox.md). Full mechanics:
  [reference/sync-engine.md](../reference/sync-engine.md).

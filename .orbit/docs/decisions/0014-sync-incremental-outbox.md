# 0014 — Sync: incremental outbox push (supersedes full-snapshot)

**Status:** Accepted · supersedes the full-snapshot push within
[0013](./0013-sync-client-uuid-lww.md)

## Context

The first v1 sync push sent a **full snapshot** of the project. Because the server
stamps every pushed row `updated_at = NOW()` and excludes just-pushed ids from the
pull, a device that re-pushed rows it had **not** changed *both* clobbered the
server's newer copy *and* excluded those rows from its own pull — so it never
learned the remote edits. And since the runner auto-syncs on focus/tick, merely
**opening a stale device reverted the other device's work**. Last device to sync
won the whole project. Proven empirically at the sync API on 2026-06-21.

## Decision

Replace full-snapshot push with an **incremental `sync_outbox`**. Each local
mutation appends `(project_id, entity_type, row_id)` via `markDirty`
(`local/shared.ts`), gated so non-synced projects accumulate nothing. A sync
captures the outbox high-water, pushes only the current state of dirty rows,
applies the pulled delta, then drains the outbox up to that high-water. The
**apply path deliberately does not enqueue** — that's the echo guard. An idle or
stale device drains nothing ⇒ pushes nothing ⇒ can't clobber, and pulls others'
edits normally. `setEnabled` seeds the whole project on the disabled→enabled
transition. Migration `0011_sync_outbox.sql`.

## Alternatives considered & why not

- **Keep full-snapshot push.** Rejected: it silently loses cross-device edits —
  the actual data-loss bug above.
- **Per-row version vectors.** Considered for the residual re-enable-clobber case;
  deferred as out of scope for v1 (heavier machinery for a narrow, deliberate
  action). Time-based LWW is sufficient for single-user-multi-device.

## Consequences

- **`markDirty` discipline is load-bearing**: a missed `markDirty` on a new
  `local/*` mutation means that edit silently never syncs. Enforced in the PR
  checklist and [conventions.md](../conventions.md).
- A per-project in-flight guard prevents focus/tick/after-save from racing the
  high-water.
- A residual clobber remains only for the deliberate re-enable-a-previously-synced
  project action — documented in [reference/sync-engine.md](../reference/sync-engine.md).

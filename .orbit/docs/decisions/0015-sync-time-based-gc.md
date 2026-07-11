# 0015 — Sync: time-based tombstone GC, not watermark

**Status:** Accepted

## Context

Soft-delete tombstones ([0013](./0013-sync-client-uuid-lww.md)) must be kept long
enough to propagate a delete to every device, then purged — otherwise they
accumulate forever.

## Decision

Purge by **age**: a periodic `DELETE … WHERE deleted_at < now - retention`
(retention ≈ 90 days, a knob) on both server and client. No device registry, no
per-device watermarks.

## Alternatives considered & why not

- **Exact / watermark GC** — purge a tombstone only once *every* device has synced
  past it. Rejected: requires device identity, per-device cursors, and an
  offline-retention policy, and buys nothing over time-based retention at this
  scale (single user, few devices).

## Consequences

- Trivial to implement and the permanent solution for this product's scale.
- Tradeoff: a device offline **longer than the retention window** won't learn about
  deletes purged in the meantime and will resurrect a few rows on return. Worst
  case: re-delete a couple of items. Accepted.

# 0022 — Drawing layer: one row per shape, JSON payload inside

**Status:** Accepted · locked 2026-07-16

## Context

The beat-board canvas is getting a drawing toolbar (freehand, shapes, arrows,
text), and the standalone `board` project type exists to host it. How drawings
persist has to be settled before any of it is built, because it's the part that's
expensive to change later — a shipped drawing is user data, and moving it between
models means a migration plus a conversion.

The original scoping (2026-07-03) recommended **a JSON blob for the whole drawing
layer** — one document per board, serialised into a column. That recommendation
was made before the sync engine's failure modes were understood in practice. Two
things since then change the answer:

- [0014](./0014-sync-incremental-outbox.md) — sync's unit of granularity is **the
  row**. Push, pull, conflict and tombstone all operate per row.
- The 2026-07-16 app-level verification, which reproduced what row-granularity
  actually buys: a stale device pushes nothing and *pulls* the other device's
  edit, instead of flattening it.

## Decision

A **`drawings` table, one row per shape**, mirroring how `beats` / `lanes` /
`connections` already live — `id`, `project_id`, `kind`, `order_index`, plus the
sync trio (`created_at`, `updated_at`, `deleted_at`).

The shape's own geometry and style (stroke points, colour, width, corner radius,
text) go in a **JSON `data` column** on that row.

So: JSON *inside* a row, not a JSON blob *instead of* rows. It registers as the
ninth synced entity in `ENTITY_MAP` and rides the existing outbox, tombstones and
server-stamped clock with no new machinery.

## Alternatives considered & why not

- **One JSON blob for the whole layer** (the original recommendation). Rejected —
  it collapses the entire drawing layer into a single row, so sync's granularity
  becomes "all of it". Two devices drawing means one device's **whole layer** is
  overwritten, and a stale device that merely *opens* the board re-pushes its old
  blob and flattens the other's work. That is precisely the clobber class 0014 was
  written to remove; reintroducing it one table over, immediately after paying to
  fix it, is not a trade worth making for a smaller diff.
- **A blob column on `projects`.** Rejected, and worse: every stroke would dirty
  the project row, so drawing would contend with title/status edits, and the
  project row's last-sync-wins would arbitrate both.
- **Fully-typed columns per shape kind** (`points`, `radius`, `x2`, `y2`, …).
  Rejected: every new shape kind becomes a migration on both SQLite and Postgres
  plus a proto change, to store data no query ever filters on. Nothing needs to
  read *inside* a shape server-side — the server stores and returns it.
- **Don't sync drawings in v1.** Rejected: board projects sync, and a canvas whose
  cards sync but whose drawings silently don't is the kind of half-truth that
  [the vault capability bug](../reference/sync-engine.md) just cost a month.

## Consequences

- **Net-new sync wiring**, the real cost of this choice: a SQLite migration, a
  Postgres migration, `SyncChanges` proto field, server apply/pull, client push
  mapper, `ENTITY_MAP` entry. Mechanical — there are eight worked examples — but
  it is more than a blob would have been.
- **Per-stroke rows match how people draw and undo.** A stroke is one atomic user
  action, so it's also the natural unit for LWW and for a future undo stack.
- **Row count grows with scribbling** — a dense sketch is hundreds of rows. That's
  the same order as `script_elements` in a long screenplay, which the outbox
  already handles by pushing only dirty rows.
- **Shape kinds stay cheap.** Adding a highlighter or a sticky note is a `kind`
  string and a `data` shape, no migration.
- Realtime co-editing of drawings is **not** in scope here; per-shape rows leave
  the door open to [0019](./0019-realtime-tiered-lww-then-crdt.md)'s element-level
  model, where a blob would have closed it.

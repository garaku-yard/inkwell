# Inkwell Sync Engine — Design (v1)

> Local-first desktop SQLite ↔ cloud `scripts-service`. Bidirectional,
> opt-in per project, DB-backed projects only. Status: **design / not built.**
> Sits on top of desktop login (the keychain bearer token + gateway URL).

## Decisions (locked 2026-06-20)

- **Bidirectional from the start** — true two-way delta sync, not a one-way
  backup step first.
- **Opt-in per project** — a "Sync this project" toggle; only flagged projects
  leave the device.
- **DB-backed projects only** — screenplay / prose / poetry / comic / ttrpg /
  if / memoir / lyrics. **Vault (`.md` file sync) is deferred to its own phase**
  (path-keyed file sync, no UUIDs/mtime — a different engine).
- **Conflict model: last-write-wins per row.**
- **Client UUID is authoritative** — the server accepts client-supplied ids
  (upsert-by-id), as `0001_initial.sql` always intended.

## Why these, from the code

- Local PKs are already client `crypto.randomUUID()` TEXT, designed to "map
  one-to-one" with the cloud — but the server today calls `uuid.New()` and
  **ignores client ids**. Making the client UUID authoritative is the
  foundation everything else needs; the alternative (a local↔remote id-mapping
  table) is brittle and FK-hostile.
- Neither side can currently detect change/deletion: no `version`/`dirty`
  column anywhere; `updated_at` is missing on beats/lanes/connections/outline
  items (local) and connections (cloud); **all child deletes are hard deletes**
  (only `projects.deleted_at` exists, cloud-side). Tombstones are mandatory for
  correct multi-device delete propagation.

## Single authoritative clock

`updated_at` is **server-stamped on every upsert** (server clock). The delta
cursor is server time. The client's local `updated_at` is for local
ordering/display only and is overwritten with the server value when a row is
pulled. This sidesteps all client-clock-skew problems. Conflict semantics are
therefore **"last sync wins"** for the rare case of the same row edited offline
on two devices — acceptable for single-user-multi-device; CRDT-grade merge is
the separate "real-time co-editing" item, not this.

## Change tracking — client change-log (outbox)

Every local mutation (create/update/delete) records the affected
`(project_id, entity_type, row_id, op)` in a **`sync_outbox`** table. Push
drains the outbox (reads the current row by id, sends it). Applying a *pulled*
server change writes the row **without** touching the outbox, so server changes
don't echo back. Recommended population mechanism: SQLite `AFTER` triggers on
each synced table (zero touch to the TS mutation code), with sync-apply writes
marked so the trigger skips them — to be finalised in stage 1.

## Protocol — one round-trip per project

`POST /api/v1/sync/projects/{id}` with the project's sync token:

```jsonc
// request
{ "cursor": "<server-time high-water, or null on first sync>",
  "changes": { "project": {...}|null, "scenes": [...], "elements": [...],
               "characters": [...], "locations": [...], "beats": [...],
               "connections": [...], "lanes": [...], "outlineItems": [...] } }
// each row carries its id + fields + deletedAt (tombstone) when deleted
```

Server, in one transaction:
1. **Apply** client changes: upsert-by-id, LWW (keep the row whose
   server-stamped `updated_at` is later; a tombstone competes by its own time).
2. **Collect** all rows for this project with `updated_at > cursor`
   (incl. tombstones).
3. **Return** `{ changes: {...}, cursor: "<new high-water>" }`.

Client applies the returned changes locally (LWW), advances the stored cursor.
First sync of a freshly-toggled project: `cursor=null`, client sends the full
project; a fresh linked device pulls the whole project the same way.

## Schema changes

**SQLite — new migration `0009_sync.sql`:**
- Add `deleted_at TEXT` to: projects, scenes, script_elements, characters,
  locations, beats, connections, lanes, outline_items, workspaces.
- Add `updated_at TEXT` to: beats, connections, lanes, outline_items.
- New `sync_state(project_id TEXT PK, enabled INTEGER, cursor TEXT,
  last_synced_at TEXT, status TEXT)`.
- New `sync_outbox(seq INTEGER PK AUTOINCREMENT, project_id, entity_type,
  row_id, op, created_at)`.
- Convert every local delete to soft-delete; every read filters
  `deleted_at IS NULL`.

**Postgres (scripts-service) — new migration:**
- Add `deleted_at TIMESTAMP` to: scenes, script_elements, characters,
  locations, beats, beat_connections, lanes, outline_items (projects already
  has it).
- Add `updated_at TIMESTAMP` to beat_connections.
- Convert child deletes to soft-delete; reads filter `deleted_at IS NULL`.
- Index `(project_id, updated_at)` on every synced table for the delta scan.
- Upsert-by-id (`INSERT … ON CONFLICT (id) DO UPDATE … WHERE excluded wins`)
  for all entity types — server stamps `updated_at = now()` on write.

## Ownership

Cloud owner is the JWT subject (already). On first sync after linking, rewrite
local `projects.owner_id` from `LOCAL_USER_ID` → the real account id so
re-pushes are consistent. Child tables have no owner (transitive via
`project_id`) — nothing to remap.

## Orchestration (client)

A sync runner over each sync-enabled project: triggers = manual "Sync now",
on app focus, debounced after-save, and a light periodic tick while open.
Requires a linked token + connectivity; offline edits queue in `sync_outbox`
and flush on reconnect. Per-project status (synced / syncing / offline / error)
surfaced on the project card + a Settings → Sync section.

## Out of scope (v1)

- **Vault** `.md` file sync (own phase).
- **Workspaces** — `projects.workspace_id` is always NULL on desktop and the
  link is unused; projects sync without workspace association.
- Device-local config: `ai_providers` + keychain, notification prefs.
- Derived/rebuildable: `note_links`, `note_tags`, `note_embeddings`,
  `project_knowledge` (regenerated from synced content where applicable).
- Real-time co-editing (CRDT) — separate deferred item.

## Implementation stages (all part of v1)

1. **Schema foundations (both sides). ✅ DONE** (local `7dc6be0`, cloud
   `c833a5c`). `deleted_at` on every synced table both sides + `updated_at` on
   the beat-board tables that lacked it; all deletes are soft-deletes (project/
   scene deletes cascade child tombstones); every list/get read filters
   `deleted_at IS NULL`; delta-scan indexes added. Verified on the live stack.
   The change-log/`sync_outbox` mechanism is deferred to Stage 3 (its own
   migration), co-located with the runner that drains it.
2. **Server: upsert + sync endpoint.** Client-id upsert-by-id (LWW) for every
   entity; `POST /sync/projects/{id}` push+pull service + handler; per-project
   delta query + indexes; the periodic time-based tombstone purge.
3. **Client: sync engine.** `sync_state` + `sync_outbox`, the runner, the
   round-trip via a new `storage.sync` domain, LWW apply, owner remap on link,
   the local tombstone purge.
4. **Client: opt-in UX + status.** "Sync this project" toggle, per-project
   status indicator, manual "Sync now", Settings → Sync.
5. **Verification.** Two local DBs ↔ cloud: create/edit/delete propagation,
   conflict (same row both sides), offline→reconnect, fresh-device pull. Run
   against the live docker stack.

## Tombstone retention (GC) — in v1, time-based

Soft-deleted rows are kept so deletes propagate, then purged by age: a periodic
`DELETE … WHERE deleted_at < now - <retention>` on both server and client
(retention ≈ 90 days, a knob). No device registry, no watermarks — trivial to
implement and the permanent solution at this scale. Tradeoff: a device offline
longer than the retention window won't learn about deletes purged in the
meantime and would resurrect a few rows on return; acceptable for
single-user-few-devices (worst case: re-delete a couple of items).

The **exact / watermark GC** (purge only once *every* device has synced past a
row) is explicitly **not** built — it requires device identity + per-device
cursors + an offline-retention policy, and buys nothing over time-based
retention for this product.

## Open risks

- **Large initial push** — first sync of a big project sends every row; bounded
  by per-project size (a screenplay is hundreds of rows / low-MB). Acceptable;
  chunk if needed.
- **"Last sync wins"** — not "last edit wins" for true offline-concurrent edits
  to one row. Acceptable for single-user-multi-device; documented.

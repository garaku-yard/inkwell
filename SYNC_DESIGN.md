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

## Change tracking — incremental push via `sync_outbox` (shipped)

**The full-snapshot push (original v1) was NOT correct and is gone.** It
silently lost cross-device edits: the server stamps every pushed row
`updated_at = NOW()` and excludes it from the pull, so a device that re-pushes a
row it never changed *both* clobbered the server's newer copy *and* excluded that
row from its own pull (never learning the remote edit). Because the runner
auto-syncs on focus/tick, just *opening* a stale device clobbered the other
device's edits. Last device to sync won the whole project. Proven empirically at
the sync API on 2026-06-21; this is the fix.

**Shipped: incremental push.** Each local mutation appends
`(project_id, entity_type, row_id)` to `sync_outbox` (`markDirty` in
`local/shared.ts`, gated on the project being sync-enabled via
`INSERT…SELECT…WHERE EXISTS` so non-synced projects accumulate nothing). A sync
captures the outbox high-water `maxSeq`, reads the *current* state of each dirty
row (`buildSnapshotFromOutbox`, joined to the outbox to dodge SQLite's
bound-parameter limit), pushes only those, applies the pulled delta, then deletes
the drained entries (`seq <= maxSeq`; rows enqueued mid-sync survive to the next
round). The **apply path deliberately does NOT append** to the outbox — that's
what stops a pulled row from echoing back as a local edit (echo would re-push the
just-pulled value and re-introduce the clobber). An idle/stale device drains
nothing ⇒ pushes nothing ⇒ neither clobbers nor mis-excludes, and pulls others'
edits normally. The server side is unchanged — apply-then-pull-excluding-pushed
was always correct *given a correct (incremental) push*.

First sync after opting in still uploads the whole project: `setEnabled` seeds
the outbox with every current row on the disabled→enabled transition
(`seedOutbox`). A freshly-pulled device has no local rows, so it seeds nothing
and its first sync is a pure pull. A per-project in-flight guard in `local/sync.ts`
stops the focus/tick/after-save triggers from running two concurrent syncs of one
project (which would race the high-water). Migration `0011_sync_outbox.sql`.

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

Server, in one transaction (**apply-then-pull**, which is convergent where
pull-then-apply is not — see below):
1. **Apply** the client's changes: upsert-by-id, stamping `updated_at = NOW()`
   (server clock). Unconditional "last-sync-wins" — the pusher always wins.
   Collect the set of pushed ids.
2. **Pull**: all rows for this project with `updated_at > cursor`, **excluding
   the ids just pushed** (incl. tombstones).
3. **Return** `{ changes: <pull>, cursor: NOW() }`.

Excluding just-pushed ids is the key: the pusher keeps its own version (which
now equals the server's), so pusher and server never diverge; other devices
converge on their next pull. The naive pull-then-apply order diverges — the
client would apply the *old* pulled row while its push writes the *new* one,
leaving local ≠ server until the row is touched again.

Client applies the returned changes locally, advances the stored cursor. First
sync of a freshly-toggled project: `cursor=null`, client sends the full project;
a fresh linked device pulls the whole project the same way (empty push ⇒ no
exclusion ⇒ full pull).

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
2. **Server: upsert + sync endpoint. ✅ DONE.** Client-id upsert-by-id
   (last-sync-wins, server-stamped `updated_at`) for every entity; the
   `POST /api/v1/sync/projects/{id}` gRPC `SyncProject` (apply-then-pull,
   exclude-just-pushed) + a protojson gateway bridge; per-project delta query;
   `PurgeTombstones` for the time-based GC (cron wiring deferred to ops).
   Verified live: client-UUID create, fresh-device full pull, delta edit,
   tombstone propagation, cross-user 403, cursor narrowing.
3. **Client: sync engine. ✅ DONE.** `sync_state` (migration 0010); a
   `storage.sync` domain (`local/sync.ts` + pure mappers in `sync-mappers.ts`,
   remote stub) gated by the `sync` capability + a linked account;
   full-snapshot push → apply pulled delta → advance cursor; local time-based
   tombstone purge. Owner-remap-on-link was replaced by a simpler fix: local
   `listOwned` ignores `owner_id` (single-user DB — filtering by the linked
   account's id would hide every project). `services/sync.ts` exposes the API
   for the UI. Mappers unit-tested; tsc/lint/build green. The actual two-device
   round-trip is exercised once Stage 4's UI drives it.
4. **Client: opt-in UX + status. ✅ DONE.** `SyncControl` in the editor header
   (status icon + dropdown: opt-in Switch, "Sync now", last-synced, "sign in to
   sync" when unlinked); `SyncRunner` in the private layout (syncs enabled
   projects on focus + a 45s tick); `useProjectSync` hook. Renders nothing on
   the web build (no `sync` capability). Smoke-tested. The dashboard project-card
   toggle was deferred (editor header covers per-project opt-in); a Settings →
   Sync overview is optional polish.
   - **4.1 — "From cloud" pull (closes the fresh-device gap).**
     `CloudProjectsButton` on the dashboard lists the user's cloud projects
     (flagging which are already local) and pulls a chosen one onto this device
     (`sync.listCloudProjects` + `pullProject` = enable sync ⇒ empty push + full
     pull writes its rows locally). This is how a browser-/other-device-made
     project reaches a machine. Smoke-tested.
5. **Verification.** Server side verified live (Stage 2). Client mappers +
   UI states unit/smoke-tested. Two-device round-trip simulated at the sync API
   on 2026-06-21 — **found the full-snapshot data-loss bug** (above).
6. **Incremental-push fix (shipped).** Replaced full-snapshot with the
   `sync_outbox` drain (see "Change tracking"). Verified at the SQLite level
   against the real migrations: the markDirty enabled-gate records nothing for
   non-synced projects; `setEnabled` seeds the full project; an idle device
   drains nothing (empty push — the data-loss fix); an editing device pushes only
   the changed row; a soft-delete cascade enqueues the scene + element tombstones
   and the pushed row carries `deleted_at`. **Remaining: the two-device
   app-level round-trip on a running desktop build** (server verified live; the
   client outbox logic is SQL-verified, not yet driven through two webviews).

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

- **Large initial push** — the *first* sync (and a re-enable) seeds the whole
  project into the outbox, so it sends every row; bounded by per-project size (a
  screenplay is hundreds of rows / low-MB). Steady-state syncs push only changed
  rows. Acceptable; chunk if needed.
- **Re-enable re-uploads (residual clobber on a deliberate action).** Opting a
  previously-synced project back in re-seeds the full project and pushes it
  ("sync my version up"). If another device edited the same rows while this one
  was disabled, the re-enable's full push clobbers those edits (last-sync-wins).
  Narrow and deliberate; the *routine* auto-sync clobber — the actual bug — is
  gone. A clean fix needs per-row version vectors (out of scope for v1).
- **"Last sync wins"** — not "last edit wins" for true offline-concurrent edits
  to one row. Acceptable for single-user-multi-device; documented.

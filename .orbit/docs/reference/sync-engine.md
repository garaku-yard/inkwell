# Reference — Sync Engine (v1)

> Local-first desktop SQLite ↔ cloud `scripts-service`. Bidirectional, opt-in per
> project. Sits on top of desktop login (keychain bearer token + gateway URL).
> This is the **canonical** home for the sync mechanics; it was migrated from the
> root `SYNC_DESIGN.md` (which now redirects here — a stub is kept because ~20
> code comments cite that path, incl. generated + shipped-migration files).
>
> The **locked decisions** behind this engine live in the append-only decisions
> log, not here: [0013 client-UUID + LWW](../decisions/0013-sync-client-uuid-lww.md),
> [0014 incremental outbox push](../decisions/0014-sync-incremental-outbox.md),
> [0015 time-based tombstone GC](../decisions/0015-sync-time-based-gc.md). This
> doc is the *how*; those are the *why*.

## Why change/deletion detection had to be built

- Local PKs were already client `crypto.randomUUID()` TEXT, designed to map
  one-to-one with the cloud — but the server called `uuid.New()` and **ignored
  client ids**. Making the client UUID authoritative is the foundation; the
  alternative (a local↔remote id-mapping table) is brittle and FK-hostile.
- Neither side could detect change/deletion: no `version`/`dirty` column;
  `updated_at` missing on beats/lanes/connections/outline items (local) and
  connections (cloud); all child deletes were hard deletes (only
  `projects.deleted_at` existed). Tombstones are mandatory for correct
  multi-device delete propagation.

## Single authoritative clock

`updated_at` is **server-stamped on every upsert** (server clock). The delta
cursor is server time. The client's local `updated_at` is for local
ordering/display only and is overwritten with the server value when a row is
pulled. This sidesteps client-clock-skew entirely. Conflict semantics are
therefore **"last sync wins"** for the rare same-row-edited-offline-on-two-devices
case — acceptable for single-user-multi-device; CRDT-grade merge is the separate
real-time co-editing item.

## Change tracking — incremental push via `sync_outbox`

**The full-snapshot push (original v1) was NOT correct and is gone.** It silently
lost cross-device edits: the server stamps every pushed row `updated_at = NOW()`
and excludes it from the pull, so a device re-pushing a row it never changed
*both* clobbered the server's newer copy *and* excluded that row from its own pull
(never learning the remote edit). Because the runner auto-syncs on focus/tick,
just *opening* a stale device clobbered the other device. Last device to sync won
the whole project. Proven empirically at the sync API on 2026-06-21.
[decisions/0014](../decisions/0014-sync-incremental-outbox.md).

**Incremental push (shipped).** Each local mutation appends
`(project_id, entity_type, row_id)` to `sync_outbox` (`markDirty` in
`local/shared.ts`, gated on the project being sync-enabled via
`INSERT…SELECT…WHERE EXISTS` so non-synced projects accumulate nothing). A sync
captures the outbox high-water `maxSeq`, reads the *current* state of each dirty
row (`buildSnapshotFromOutbox`, joined to the outbox to dodge SQLite's
bound-parameter limit), pushes only those, applies the pulled delta, then deletes
the drained entries (`seq <= maxSeq`; rows enqueued mid-sync survive to the next
round). The **apply path deliberately does NOT append** to the outbox — that's
what stops a pulled row echoing back as a local edit. An idle/stale device drains
nothing ⇒ pushes nothing ⇒ neither clobbers nor mis-excludes, and pulls others'
edits normally.

First sync after opting in still uploads the whole project: `setEnabled` seeds the
outbox with every current row on the disabled→enabled transition (`seedOutbox`). A
freshly-pulled device has no local rows, so it seeds nothing and its first sync is
a pure pull. A per-project in-flight guard in `local/sync.ts` stops
focus/tick/after-save triggers from racing the high-water. Migration
`0011_sync_outbox.sql`.

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
pull-then-apply is not):

1. **Apply** the client's changes: upsert-by-id, stamping `updated_at = NOW()`
   (server clock). Unconditional last-sync-wins — the pusher always wins. Collect
   the set of pushed ids.
2. **Pull:** all rows for this project with `updated_at > cursor`, **excluding the
   ids just pushed** (incl. tombstones).
3. **Return** `{ changes: <pull>, cursor: NOW() }`.

Excluding just-pushed ids is the key: the pusher keeps its own version (which now
equals the server's), so pusher and server never diverge; other devices converge
on their next pull. The naive pull-then-apply order diverges — the client would
apply the *old* pulled row while its push writes the *new* one, leaving
local ≠ server until the row is touched again.

Client applies the returned changes locally, advances the stored cursor. First
sync of a freshly-toggled project: `cursor=null`, client sends the full project;
a fresh linked device pulls the whole project the same way (empty push ⇒ no
exclusion ⇒ full pull).

## Schema changes

**SQLite — migrations `0009_sync.sql` / `0010_sync_state.sql` / `0011_sync_outbox.sql`:**
- `deleted_at TEXT` on projects, scenes, script_elements, characters, locations,
  beats, connections, lanes, outline_items, workspaces.
- `updated_at TEXT` on beats, connections, lanes, outline_items.
- `sync_state(project_id TEXT PK, enabled INTEGER, cursor TEXT, last_synced_at
  TEXT, status TEXT)`.
- `sync_outbox(seq INTEGER PK AUTOINCREMENT, project_id, entity_type, row_id, op,
  created_at)`.
- Every local delete becomes a soft-delete; every read filters `deleted_at IS NULL`.

**Postgres (scripts-service) — migration `000005_sync`:**
- `deleted_at TIMESTAMP` on scenes, script_elements, characters, locations,
  beats, beat_connections, lanes, outline_items (projects already had it).
- `updated_at TIMESTAMP` on beat_connections.
- Child deletes become soft-deletes; reads filter `deleted_at IS NULL`.
- Index `(project_id, updated_at)` on every synced table for the delta scan.
- Upsert-by-id (`INSERT … ON CONFLICT (id) DO UPDATE`) for all entity types;
  server stamps `updated_at = now()` on write.

## Ownership

Cloud owner is the JWT subject. On first sync after linking, local
`projects.owner_id` is rewritten `LOCAL_USER_ID` → real account id so re-pushes
are consistent. (In practice local `listOwned` ignores `owner_id` — a single-user
DB — so filtering by the linked id would hide every project.) Child tables have no
owner (transitive via `project_id`).

## Orchestration (client)

A sync runner over each sync-enabled project: triggers = manual "Sync now", app
focus, debounced after-save, and a light periodic tick (45s) while open. Requires
a linked token + connectivity; offline edits queue in `sync_outbox` and flush on
reconnect. Per-project status (synced / syncing / offline / error) surfaced on the
project card + a Settings → Sync section. `SyncControl` (editor header) +
`SyncRunner` (private layout) + `useProjectSync`; renders nothing on the web build
(no `sync` capability). `CloudProjectsButton` on the dashboard lists cloud
projects and pulls a chosen one onto a fresh device.

## Vault file sync (path-keyed engine)

Vault projects are a folder of real files, not UUID rows, so they sync through a
**separate, path-keyed engine** — keyed by vault-relative path, never a UUID. The
server had no file store, so this is a new subsystem that *mirrors* the row
engine's contract (server clock, tombstones, apply-then-pull-excluding-pushed,
owner-only auth) rather than extending it.

**Server.** A `vault_files` table (`(project_id, path)` PK, `content BYTEA` —
markdown UTF-8, attachments raw bytes — `content_hash`, server-stamped
`updated_at`, `deleted_at`; migration `000006`). Proto `VaultFile`/`VaultCursor`/
`SyncVaultRequest`/`Response` + a `SyncVault` RPC behind
`POST /api/v1/sync/vault/projects/{id}`. Apply upserts by path (last-sync-wins);
pull is **keyset-paginated by `(updated_at, path)`** — a composite cursor so a
large first pull never skips files sharing a timestamp — bounded per page by file
count AND byte budget with `has_more`. Tombstone GC reuses the daily cron.

**Client (`local/vault-sync.ts`).** A per-file **manifest** (`vault_manifest:
path → content hash at last sync` = the common base). Each sync walks the vault,
hashes every file, diffs against the manifest to classify created/modified/deleted;
only changed files are pushed (batched under the request cap), then the pulled
delta is applied to disk and the manifest advanced. The manifest is the **echo
guard** — a pulled file's hash is recorded as we write it, so the watcher firing on
our own write never looks like a fresh local edit. Conflicts resolve
last-sync-wins, but an UNSYNCED local edit is never overwritten by an apply (kept
and pushed next round). `syncProject`/`setEnabled` route by `project.category`.

**Scope + limits (v1).** Syncs all non-hidden files (`.md` + attachments);
`.obsidian`/`.git`/dotfiles skipped. A file over 20 MB is skipped on push (base64
+ the 32 MiB request cap) — surfaced in the UI. Per-file re-hashing every sync is
O(vault); an mtime/size fast-path is shipped as a perf follow-up.

## Out of scope (v1)

- **Workspaces** — `projects.workspace_id` is always NULL on desktop; projects
  sync without workspace association.
- Device-local config: `ai_providers` + keychain, notification prefs.
- Derived/rebuildable: `note_links`, `note_tags`, `note_embeddings`,
  `project_knowledge` (regenerated from synced content).
- Real-time co-editing (CRDT) — separate item.

## Tombstone GC — time-based

Soft-deleted rows are kept so deletes propagate, then purged by age
(`DELETE … WHERE deleted_at < now - retention`, ≈90 days) on both server and
client. No device registry, no watermarks. Tradeoff: a device offline longer than
the retention window resurrects a few rows on return — acceptable for
single-user-few-devices. The exact/watermark GC is explicitly not built.
[decisions/0015](../decisions/0015-sync-time-based-gc.md).

## Open risks

- **Large initial push** — the first sync (and a re-enable) seeds the whole
  project; bounded by per-project size (a screenplay is hundreds of rows / low-MB).
- **Re-enable re-uploads** — opting a previously-synced project back in re-seeds
  and pushes the full project; if another device edited the same rows while this
  one was disabled, the re-enable clobbers them (last-sync-wins). Narrow and
  deliberate; the routine auto-sync clobber (the actual bug) is gone. A clean fix
  needs per-row version vectors (out of scope for v1).
- **"Last sync wins"** — not "last edit wins" for true offline-concurrent edits to
  one row. Documented, accepted.

## Verification status

Server side verified live (SQL against real Postgres + full HTTP→gRPC→service→repo
via curl: upsert-by-id/path, fresh-device full pull with exact **binary** byte
round-trip, incremental delta, tombstone propagation, cross-user 403, keyset
tiebreaker). **Remaining: the two-device app-level round-trip on a running desktop
build** — both engines, the same open gate. Tracked in [roadmap.md](../roadmap.md).

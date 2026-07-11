# Glossary

> The domain vocabulary as it's actually used in Inkwell's code and docs.
> Defined here once; other docs use these terms without re-defining them.

### Category / format
A project's writing format. Nine exist: **screenplay, prose, poetry, comic,
TTRPG, interactive fiction (IF), memoir, lyrics, and vault**. `project.category`
routes the UI (`EditorFactory`), the analytics, the export set, and the beat
board's lane labels. Poetry and lyrics share an editor.

### Format-native editor
An editor tuned to one category's conventions (screenplay scene/action/dialogue
elements, comic Marvel/DC layout, IF `[[links]]`, etc.) while riding the **same
page surface** as the others, so the formats feel like one tool.

### Element
A single content block inside a scene — a line of dialogue, an action line, a
stanza, a passage, a stat block. Persisted in the `script_elements` table
(physical name kept as plumbing; the Go entity is `ProjectElement` — bare
`Element` collides with the DOM global). Each has a `type` from its category's
vocabulary.

### Scene
The mid-level container between a project and its elements (a screenplay scene, a
prose chapter, a comic page, an IF passage). Terminology varies per format; the
row is a `scene`.

### Beat board
A free-form canvas of story **beats** with swim **lanes**, **connections**, and
timeline placement. Generalised across all categories via
`getCategoryStructure()`; also exposed as a standalone "Board" project type.

### Vault
A `category === "vault"` project: a folder of real markdown files on disk with
live-preview editing, `[[wikilinks]]`, backlinks, a subfolder tree, a filesystem
watcher, and a graph view. Desktop-only (the web build can't reach the
filesystem).

### Wikilink / backlink
`[[Target]]` (or `[[Target|Alias]]`) links between vault notes, click-to-open /
create-on-click. A **backlink** is the reverse edge, read from the `note_links`
SQLite index and shown in the backlinks panel.

### Vault-as-knowledge (RAG)
Wiring a non-vault project to scopes of a vault (whole vault / folder / tag) so
the AI chat retrieves those notes as context. Local embeddings
(all-MiniLM-L6-v2, ONNX/WASM in the webview), brute-force cosine, `read_note`
tool. `ai.knowledge` capability; desktop-only.

### BYO AI (bring-your-own-key)
Every chat goes through a user-configured **provider row** (OpenAI / Anthropic /
Gemini / `openai_compatible`). Desktop keys live in the OS keychain and dispatch
from the webview; hosted keys are AES-256-GCM-encrypted in `aisettings-service`.
See [decisions/0008](./decisions/0008-byo-key-ai-only.md),
[0009](./decisions/0009-openai-compatible-allowlist.md),
[0010](./decisions/0010-aes-gcm-key-vault.md).

### Storage abstraction
The `client/lib/storage/` layer: one `Storage` interface with two
implementations — **local** (SQLite + filesystem, Tauri) and **remote** (HTTP
gateway, web). Chosen at runtime by `StorageProvider` via `isTauri()`. Services
call `getStorage()`; components never branch on platform. See
[decisions/0004](./decisions/0004-storage-abstraction.md).

### Capability
An optional feature flag on the bound storage impl: `auth`, `collaboration`,
`realtime`, `admin`, `ai.byo`, `ai.knowledge`, `sync`. UI hides what isn't bound.

### Gateway
The chi HTTP router (`:8080`) that authenticates requests (JWT → identity),
enforces rate limits (Redis), and proxies to the gRPC services. **Not a
service** — a thin HTTP↔gRPC translation layer. See
[decisions/0007](./decisions/0007-gateway-thin-proxy-db-per-service.md).

### Service
One of the backend Go microservices (identity, scripts, collab, billing,
workspace, aisettings, notifications), each owning its own Postgres DB and
speaking gRPC. Cross-service reads go through gRPC, never a shared DB.

### Outbox (transactional outbox)
`pkg/outbox`: domain events enqueued in the same DB transaction as the write,
then published to Kafka by a poller. Used by scripts + billing (identity + collab
have their own outbox migrations).

### Tombstone / soft-delete
A `deleted_at` marker instead of a hard delete, so deletions propagate through
sync. Reads filter `deleted_at IS NULL`; a periodic time-based GC purges old
tombstones. See [reference/sync-engine.md](./reference/sync-engine.md).

### LWW (last-write-wins) / "last sync wins"
The sync conflict model: the server stamps `updated_at` on every upsert (single
authoritative clock); the pushing device wins a same-row conflict. Distinct from
CRDT-grade merge, which is the separate real-time co-editing concern.

### sync_outbox / markDirty
Incremental cloud-sync change tracking: each local mutation appends
`(project_id, entity, row_id)` to `sync_outbox` via `markDirty` (in
`local/shared.ts`); a sync pushes only the marked rows. Replaced the original
full-snapshot push (a data-loss bug). See
[decisions/0014](./decisions/0014-sync-incremental-outbox.md).

### Presence / soft-lock / edit session
Real-time collaboration signals over the WebSocket transport: **presence** =
who's in a project (avatars, roster); **soft-lock** = a per-scene "someone is
editing here" pip; **edit session** = a durable advisory lock recorded in
`edit_sessions`. Live element edits use element-level LWW; carets are
server-stamped and not persisted. See
[decisions/0019](./decisions/0019-realtime-tiered-lww-then-crdt.md).

### Org vs workspace
A **workspace** is a per-category grouping surface (switcher, drag-reorder). An
**organization** is a first-class multi-user tenant that **owns** projects
(Option B) and carries the per-seat Business billing tier. See
[decisions/0018](./decisions/0018-org-model-option-b.md).

### `.iw` project file
A lossless single-JSON envelope of a non-vault project (project + scenes /
elements / characters / locations + full beat board). Import/export only today;
making it the on-disk source of truth is deferred. See
[decisions/0016](./decisions/0016-iw-portable-project-file.md).

### Model B (identity)
The `(username, user_tag)` **pair** is unique, not the username alone — a
Discord-style `username#tag` scheme. See
[decisions/0011](./decisions/0011-identity-model-b.md).

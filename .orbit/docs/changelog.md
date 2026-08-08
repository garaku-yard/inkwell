# Changelog

> The narrative history — what shipped and why. **Append-only**: add entries at
> the top; don't rewrite the past. Grouped by theme rather than exact dates
> (much of this predates the docs migration and is reconstructed from the prior
> handoff notes + git history). The live status matrix is
> [PLANNING.md](../../PLANNING.md); forward intent is [roadmap.md](./roadmap.md).

## The agent asks first, and what it did can be undone

ADR 0025 said a mutating tool is declared as such *and confirmed*. Only the
declaring had shipped. The in-app chat was denied every destructive tool because
its loop had no way to ask a human anything, and the MCP bridge was handed the
full set on the strength of its clients prompting — an external program's good
manners standing in for a gate Inkwell owned. Stage 4 closes it
([decisions/0027](./decisions/0027-inkwell-owns-the-destructive-gate.md)): one
approval broker, both consumers, one modal that names what is about to go
("Delete \"The Briefing\" and its 4 elements") rather than a tool name and a
uuid. A request with nothing mounted to answer it refuses immediately; one
nobody answers expires after two minutes rather than blocking the loop forever.
The chat can now delete and rewrite, which it never could — the gate moved from
*which tools exist* to *what happens before one runs*.

Confirmation was never the whole problem, though. The expensive case is the call
the writer **approves** and then regrets, and no dialog prevents that. Every
destructive tool already soft-deleted — `scenes.delete` cascades `deleted_at` to
the scene's elements, `rewrite_scene` removes the old text only after committing
the replacement — so the rows were on disk the whole time with no way to reach
them. Migration 0016 adds `agent_undo`, a row per destructive call holding the
ids to restore and the ids to remove, and **Recent AI changes** in the Writing
Buddy header replays it. The journal never syncs; the restore it performs does.
Undo is deliberately not a tool: an agent that has just done the wrong thing is
the wrong thing to ask to reverse it.

## Sidebar and Play text stopped rendering bold

The passage list looked heavier in one project than another in the *same build*.
Measured rather than guessed: every shared region of the two screenshots was
byte-identical, so it was neither font nor theme nor DPI. The lists differed only
in whether they overflowed. Painting the scroller — the previous fix — holds only
until it scrolls, because WebKit then splits it into a container layer and a
scrolling-contents layer carrying the rows, and the background stays behind on
the container. Text without an opaque backdrop *in its own layer* degrades over
this deliberately-transparent window: 2.74px stems and 60% more ink, against
cores landing exactly on `rgb(105,98,92)` when it renders correctly. Rows now
carry their own background, which is the configuration the selected row always
had and which measured crisp in both. The IF **Play** view had the identical
shape and the textbook symptom — 0.0% colour fringing, the signature of the
grayscale fallback — fixed the same way on its inner page.

## Inkwell as a tool surface — and orgs without an account

The desktop's operations became **one registry** defined over `Storage`, with
two consumers: the in-app chat and an **MCP bridge hosted inside the running
Tauri app** ([decisions/0025](./decisions/0025-one-tool-registry-two-consumers.md)).
The chat could previously read exactly one note through a hard-coded
`if (call.name === "read_note")`; it can now list projects and scenes, read a
scene, search wired notes, create projects and scenes, append text and add
beats. Claude Code and Claude Desktop drive the same tools over a loopback
endpoint — `127.0.0.1` only, per-launch token, `0600` handshake file — with a
thin stdio shim that knows how to find the app and nothing about writing.

Scene text lands in each format's own element vocabulary (`paragraph` prose,
`ACTION` screenplay, `line` verse, `panel` comics, `choice` for an
interactive-fiction link line, mirroring what the twee importer produces when
reading one in). Writes were additive until `rename_scene`, `rewrite_scene`
and `delete_scene` arrived; `rewrite_scene` commits the replacement before
removing the old text, so a failure part-way leaves both versions rather than
neither. The tools that can take writing away are withheld from the in-app
chat, which has no way to ask first — the bridge offers them because its
clients prompt. Confirmation inside Inkwell itself is still owed (#202 stage 4).

**Organizations no longer need an account.** 0023 made them gateway-only,
reasoning an org is shared tenancy with nothing to model locally; that holds
for *membership* and not for grouping your own work, and it meant a
local-first app demanded a server to organise files on its own disk. An org is
now a local object a cloud account can extend
([decisions/0026](./decisions/0026-local-orgs-when-signed-out.md)) — no new
table, since the org workspace rows already existed and `projects.org_id`
already pointed at them. Inviting and seats still refuse locally, with the
real reason rather than "sign in".

Typography got three fixes found by measuring pixels rather than trusting the
eye: `antialiased` on `<body>` had subpixel antialiasing switched off
app-wide; the per-format editor fonts were being overridden by a migration
that mirrored a *non-choice* from the old single-font schema onto all seven
formats; and the interface font picker had never worked at all, because the
font variables sat on `<body>` while the property referencing them was set on
`<html>`, so every stack computed to invalid.

## Organizations on the desktop

Orgs became usable from the desktop build, which previously offered a "Create an
organization" form that could only fail: the local `Storage` rejected every org
call. The desktop now serves org *administration* — members, seats, invites —
from the gateway while everything else stays local SQLite
([decisions/0023](./decisions/0023-orgs-in-desktop-hybrid-storage.md)), and holds
org-owned **projects locally** in a new `projects.org_id` column, so creating one
needs no server and works offline like the rest of the app
([decisions/0024](./decisions/0024-org-projects-held-locally.md)). Before that
column existed the org id was silently dropped on insert, so a project made
inside an org became a personal one and vanished from the org it was made from.
Org projects reach other devices through the existing per-project sync, whose
pull path now round-trips `org_id`.

Alongside: the window titlebar no longer scrolls out of view on editor routes (an
`h-screen` shell inside a viewport-minus-titlebar container, which focus-driven
scrolling then pushed off the top), and an unreachable gateway now names the
origin it tried instead of surfacing WebKit's bare "Load failed".

## Real-time co-editing

Shipped a tiered live-collaboration stack over a WebSocket transport: per-project
room hubs, message protocol + presence, live element edits, Redis cross-instance
fan-out, a cluster-wide presence roster, reconnect resync, per-connection inbound
rate limiting, soft-lock presence highlights, and **remote carets** (Google-Docs-
style floating cursor + name flag, server-stamped, not persisted). Rolled across
IF → prose/poetry/comic/ttrpg → screenplay via a shared `useEditorRealtime`
hook, then deduped IF onto it. Durable advisory **edit-session locks** recorded
from the socket and surfaced as per-scene pips. Element edits are LWW; CRDT is a
later tier. **Browser-verified** two-participant on Prose + Screenplay.
[decisions/0019](./decisions/0019-realtime-tiered-lww-then-crdt.md).

## First-class organizations

Introduced organizations as a first-class multi-user tenant that **owns**
projects (Option B): org entity + member authorization, org-owned projects +
org-member access, org context in the client (storage, rail zone, dashboard
switch), seat enforcement + invites inbox + org settings, and owner-driven seat
expand/shrink. Ties into the Business billing tier.
[decisions/0018](./decisions/0018-org-model-option-b.md).

## Cloud sync (opt-in, desktop)

Built two sync engines, both server-verified end-to-end:

- **Row engine** — DB-backed projects, client-UUID authoritative, last-sync-wins,
  opt-in per project. Schema foundations (tombstones + `updated_at` both sides) →
  `SyncProject` RPC (apply-then-pull-excluding-pushed) → client engine +
  `SyncControl`/`SyncRunner` UX → "From cloud" pull for fresh devices. The
  original **full-snapshot push was found to silently lose cross-device edits**
  and was replaced with an incremental `sync_outbox` push — the crown-jewel
  correction. [decisions/0013](./decisions/0013-sync-client-uuid-lww.md),
  [0014](./decisions/0014-sync-incremental-outbox.md).
- **Vault file sync** — a separate path-keyed engine (server `vault_files` +
  `SyncVault`, client per-file content-hash manifest with an mtime/size
  fast-path; markdown + binary attachments; oversized-file skips surfaced).

Full mechanics: [reference/sync-engine.md](./reference/sync-engine.md). Remaining
gate: the two-device app-level round-trip on a running desktop build.

## Desktop account link + token auth

The Tauri build can optionally sign into a cloud account (token in the OS
keychain, replayed as `Authorization: Bearer`; token clients CORS/CSRF-exempt for
the `tauri://localhost` origin). Silent 24h→7d refresh. Never a forced gate — the
app runs fully offline and `me()` returns the local profile when unlinked.
[decisions/0017](./decisions/0017-optional-desktop-login.md).

## Open-core monetization (built, inert)

Admin-configurable Free/Pro/Business tiers, quota enforcement, per-seat billing
with auto-sync, Paddle checkout + webhooks (inert until `PADDLE_*` set),
managed-AI dispatch metered by tokens with per-tier monthly allowances, usage
display, admin subscription views, legal pages. Awaiting operator Paddle
onboarding. [decisions/0020](./decisions/0020-monetization-open-core-paddle.md).

## Editor convergence + per-format import

Brought all eight non-vault formats onto **one shared page surface** (A4 sheets
on a desk + margin tool rail; screenplay the lone US-Letter exception on the same
`PagedSheets`), deleting the bespoke screenplay `EditorPane` and top toolbar.
Shared `EditorSidebar` + `useEditorComments` across the simple editors, floating
`SaveStatusPill`, centered nav pills. Per-format **Import** in every editor header
(md/txt→prose+ttrpg, twee→IF, txt/cho→poetry, fdx→screenplay; lossless `.iw`→new
project). The editor canvas is codified as a brand surface (BRANDBOOK §8), pinned
by `PagedSheets.smoke.test.tsx`. [decisions/0016](./decisions/0016-iw-portable-project-file.md).

## Non-screenplay editor uplift

Brought Prose / Poetry / Comic / TTRPG / IF up to screenplay-class keyboard
parity: a generic `createElementNavigationKeymap` engine, arrow-nav +
backspace-on-empty delete, per-editor Tab cycling + digit shortcuts, IF
`[[`-autocomplete + create-on-Enter, TTRPG Notion-style `/` slash menu, plus
format-unique features (dice-table previews, stat-block templates, IF full-text
search + Twee export + runtime preview, comic panel jump + CBZ, ChordPro export,
prose EPUB). The `StableContentEditable` primitive fixed a cross-editor cursor-
jump bug. Engine + per-format config throughout — no `<BaseEditor>`.
[decisions/0012](./decisions/0012-engine-plus-config-over-baseeditor.md).

## BYO AI (end-to-end)

Every chat goes through a user-configured provider row. Desktop keys in the OS
keychain dispatch from the webview; hosted keys are AES-256-GCM-encrypted in the
new `aisettings-service` (AAD-bound to `(userID, rowID)`). Per-user rate limiting,
operator-allowlisted `openai_compatible`, mid-stream `{error}` NDJSON line +
friendly status-code mapping. **The legacy Python AI service was deleted** once
BYO became the only path. [decisions/0008](./decisions/0008-byo-key-ai-only.md),
[0009](./decisions/0009-openai-compatible-allowlist.md),
[0010](./decisions/0010-aes-gcm-key-vault.md).

## Vault category

CodeMirror 6 live-preview markdown, `[[wikilinks]]` (incl. pipe aliases +
click-to-create), backlinks panel with a SQL index, recursive filesystem watcher,
subfolder tree, local images via the asset protocol, settings dialog, inline
rename with wikilink sweep, hand-rolled force-directed graph view, `#tags` parser
+ filter panel, attachments (paperclip → `attachments/`). Vault-as-knowledge
(RAG) for non-vault projects: local embeddings, brute-force cosine, `read_note`
tool. [decisions/0006](./decisions/0006-vault-notes-as-files.md).

## Frontend SRP / dedup refactor

A large pass (~21 commits) decomposing the keystone editors (ScreenplayEditor
1057→585 LOC, VaultEditor 1415→806, AIChatPanel 555→129, etc.) into co-located
hook + render dirs, plus cross-component reuse that passed the rule of three
(`PaneSpinner`, `FullPageSpinner`, `EmptyEditorState`, `useProjectLoader`,
`useElementAutosave`). Five sites that looked shared but failed rule-of-three
stayed inline.

## Tauri desktop app

Full desktop shell: Next.js static export, SQLite storage, dialog/fs/sql/opener
plugins, asset protocol, branded icons, a custom frameless transparent themed
titlebar ([decisions/0005](./decisions/0005-frameless-themed-titlebar.md)),
`.fdx` file association + open-file handler, GitHub Actions CI + matrix release
pipeline, Arch AUR PKGBUILD.

## Releases

**v0.2.0, v0.2.1, v0.2.2, v0.2.3** shipped to GitHub Releases (Windows + Linux
bundles via the GH Actions matrix). v0.2.3 added the vault graph view + `#tags`.

## Security / correctness hardening

Sub-resource authorization (every beat/lane/connection/outline/element mutation
resolved to its **real** owning project — no `uuid.Nil` bypass); JWT secret
alignment; SQL-parametric everywhere; scoped CORS; admin role gate; per-user AI
rate limiter; identity **Model B** (`username#tag`,
[decisions/0011](./decisions/0011-identity-model-b.md)); vault orphaned-index
reconcile; storage-boundary nil coercion fixing the recurring `.trim()` crash.

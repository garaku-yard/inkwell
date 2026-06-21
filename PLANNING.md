# Inkwell — Project Status

> Living status of what's shipped, what's partial, and what's planned. Kept in
> sync with the architecture + handoff detail in `CLAUDE.md`.
> Last synced: 2026-06-21.

Legend: ✅ shipped & working · ⚠️ partial · 🚧 planned / not built

---

## Platform

| Area | Status | Notes |
|---|---|---|
| Desktop app (Tauri v2 + Next.js static export) | ✅ | Windows + Linux bundles via GH Actions; macOS deferred |
| Local-first storage (SQLite + on-disk `.md`) | ✅ | `lib/storage` abstraction with local (SQLite/FS) + remote (gateway) impls |
| Hosted stack (Go microservices / gRPC / Postgres / Redis / Kafka) | ✅ | Self-hostable, optional — most users never need it |
| Releases | ✅ | v0.2.0–v0.2.3 on GitHub Releases |

## Editors — nine format-native surfaces

| Editor | Status | Notes |
|---|---|---|
| Screenplay | ✅ | element types, scene/character autocomplete, FDX + PDF export, FDX import. Now on the **shared `PagedSheets`** surface too (US-Letter geometry preserved) — the bespoke `EditorPane` + top `Toolbar` are gone; comments unified onto `useEditorComments` |
| Prose, Poetry / Lyrics, Comic, TTRPG, Interactive Fiction, Memoir | ✅ | per-format element vocabularies, screenplay-class keyboard parity, format-specific export (EPUB / ChordPro / CBZ / Twee / txt / md). **All formats now on the shared A4 page + margin tool rail** (Comic/TTRPG/IF converted; `716703a`) |
| Vault (markdown) | ✅ | CM6 live-preview, `[[wikilinks]]` + backlinks, subfolder tree, recursive fs watcher, force-directed graph, `#tags`, attachments, rename sweep |

## Features

| Feature | Status | Notes |
|---|---|---|
| Beat board (all categories) | ✅ | canvas, story lanes, connections, outline items; owner + collaborator access |
| Outline editor | ✅ | timeline + structure view |
| Per-category analytics | ✅ | computed from real scenes/elements |
| Workspaces | ✅ | switcher, per-category, drag-reorder |
| Auth | ✅ | cookie/JWT, register/login, sessions. Usernames are **not** globally unique — the `(username, user_tag)` pair is (Discord-style "Model B") |
| Collaboration | ✅ | collaborators, invitations, comments, presence. Real-time co-editing is **not** built (see deferred) |
| Export | ✅ | PDF / FDX / EPUB / ChordPro / CBZ / Twee / txt / md, client-side |
| Import | ✅ | Per-format, client-side, in every editor (`716703a`). Editor Import lands **into the current project**; dashboard Import creates a new one. Parsers: `.md`/`.txt`→Prose+TTRPG, `.twee`→IF, `.txt`/`.cho`→Poetry, `.fdx`→Screenplay. Verified end-to-end (Playwright). Comic omitted (no clean text inverse). |
| BYO AI chat (every editor) | ✅ | OpenAI / Anthropic / Gemini / openai_compatible; desktop keys in OS keychain, hosted keys AES-256-GCM in `aisettings-service` |
| Vault-as-knowledge (RAG) | ✅ | desktop-only; local embeddings (`@huggingface/transformers`, all-MiniLM-L6-v2), brute-force cosine, `read_note` tool |
| Settings (11 sections) | ✅ | appearance / themes / per-editor fonts wired; some sections informational |
| Admin billing | ⚠️ | tier editor + subscriptions UI present; **enforcement gated on the monetization decision** |

## Security / correctness

- ✅ Every gateway sub-resource mutation (beats / lanes / connections / outline items / elements) is authorized against the resource's **real** owning project — `GetResourceProject` lookup → `ResolveProjectAccess` → dispatch, 403 otherwise. No more blanket `uuid.Nil` bypass.
- ✅ JWT secret alignment, SQL-parametric everywhere, scoped CORS, admin role gate, per-user AI rate limiter, operator-allowlisted `openai_compatible` hosts, chat error UX.

---

## Open / deferred

- **Open-core monetization — BUILT (pending Paddle onboarding).** Decided + implemented: admin-configurable Free/Pro/Business tiers; quota enforcement (projects, collaborators-per-project, org-workspace gating); per-seat billing with auto-sync; Paddle checkout + webhooks (inert until `PADDLE_*` set); managed-AI dispatch metered by tokens with per-tier monthly allowances (Redis counters); usage display; admin subscription views; legal pages. Remaining: Paddle creds/price-ids + webhook registration + legal placeholders (done together with the operator).
- **Desktop login — BUILT (optional account-link). Sync engine next.** The Tauri build can now sign into a cloud account: token auth (the gateway returns the JWT in-body for `X-Inkwell-Client: desktop`, stored in the OS keychain and replayed as `Authorization: Bearer`; CORS/CSRF exempt token clients so the webview's `tauri://localhost` origin works). It's an *optional link* — the app still runs fully offline with no account and all data stays in local SQLite; `me()` returns the real account when linked, else the local profile, so there's never a forced login gate. Gateway defaults to `https://inkwell.garakuyard.com` with a Settings → Account override for self-hosters. **Verified end-to-end on the desktop app** (sign in / out round-trip through the webview against the live stack), plus the header reflects linked-vs-local (not-signed-in state offers "Sign in", not a fake account). Token auto-refresh shipped (`42a17e6`/`fa58e9d`): 24h access token renews silently from a 7-day refresh token in the keychain via `POST /auth/refresh`, so no daily re-login. **Sync engine — BUILT (v1, stages 1–4 + polish; see `SYNC_DESIGN.md`).** Bidirectional, opt-in per project, DB-backed projects only (vault deferred), last-sync-wins, client-UUID-authoritative. Stage 1 tombstones + `updated_at` on every synced table both sides (`7dc6be0`/`c833a5c`); Stage 2 `POST /api/v1/sync/projects/{id}` gRPC `SyncProject` (apply-then-pull-excluding-pushed) verified live (`eaeaa64`); Stage 3 client engine — `local/sync.ts` full-snapshot push + apply + `sync_state`, `sync` capability, `listOwned` owner-filter fix (`845d614`); Stage 4 `SyncControl` (editor header) + `SyncRunner` (focus + 45s tick) + `useProjectSync` (`a8f9662`); "From cloud" pull (`b62171b`); polish (`b8e59e6`): dashboard card toggle, Settings → Sync section, server tombstone-GC cron (`42a17e6`). **Remaining: the two-device app-level round-trip on a running desktop build** (server verified live; client mappers/UI unit+smoke-tested). Future: incremental (outbox) push instead of full-snapshot; vault file sync; "remove from cloud" semantics (deferred decision).
- **Mobile (Android/iOS)** — Tauri v2 targets mobile, so it's mechanically possible, but a *large* vertical for this app: the vault's arbitrary-folder filesystem model + recursive watcher, the OS keychain (BYO keys), the desktop window chrome, and the keyboard-centric editor UX don't map to mobile sandboxing/touch. Cleanest path is a hosted-first thin client (remote storage), which is gated behind the desktop-login/sync work above. Revisit AFTER desktop login + sync.
- **Editor UI/UX consistency + brand identity — DONE for all eight non-vault formats** (`716703a`; Vault stays CM6/markdown). One shared editor design language so the formats feel like one product. **Shipped:**
  - **Shared sidebar + comments across all five simple editors** (Prose / Poetry / Comic / TTRPG / IF): `EditorSidebar` (header + stat badges + `[List | Comments]` tabs) + `useEditorComments` + `CommentPanel`, with per-element comment threads. Opt-in extras: `subItems` (TTRPG nests h2 subheadings), `searchable` + per-item `searchText` (IF passage search). The Comments tab falls back to the chapter/poem/page/section/passage in view when nothing is focused.
  - **`EditorToolRail`**: collapsed handle morphs in place on hover; supports expandable **groups** (a `*`-marked icon opens a margin-side flyout, e.g. Prose's Heading → H1/H2/H3, backed by real `heading_2`/`heading_3` types + Markdown/EPUB export).
  - **`ProjectNavMenu`** is now centered inline pills (3-col `EditorHeader` grid); **AIChatPanel** flattened to match the canvas; quiet themed scrollbar on every desk.
  - **A4 page + tool rail — shared primitives** (`lib/editor/paginate.ts` + `components/editor/shared/PagedSheets.tsx`): discrete sheets (min-height so estimated breaks never clip) on a desk with the rail in the margin. **All eight non-vault formats render on them** — Prose, Poetry, Comic, TTRPG, IF (active passage, write view only), and **Screenplay** via a generalized `pageSize` prop (`SheetMetrics`, defaults A4) carrying US-Letter geometry so the screenplay page count stays semantic (1pg ≈ 1min).
  - **Screenplay convergence** — deleted the bespoke `EditorPane` (a non-virtualized US-Letter clone of paginate+PagedSheets) and the orphaned top `Toolbar`; screenplay now uses the shared `EditorHeader` (centered nav pills) + margin rail + `PagedSheets`, with `EditableElement` as its `renderBlock`. Comments unified onto the shared `useEditorComments` (the 4 hand-rolled handlers + `refreshTrigger` gone; inline badge derives from the flat list).
  - **Floating save-status pill** (`SaveStatusPill`, bottom-right) replaces the in-header save text on every editor; the redundant scene-count stat is out of the screenplay header.
  - **Per-format Import** in every editor header (see Import row above) — `EditorHeader.importItems` + a shared file picker; client-side parsers under `lib/import/` → `importIntoProject` (into the current project). Fixed a pre-existing remote-storage bug found in QA: the gateway wraps created/updated elements as `{element:…}` and `remote/elements.ts` returned the envelope, so optimistic renders had no id/content (`78651d0`).
  - **Verified end-to-end via Playwright** against the live web stack (registered a throwaway account): screenplay rail-in-margin + save pill + header; import round-trips for md/txt→Prose, twee→IF, txt/cho→Poetry, md→TTRPG, fdx→Screenplay.
  - **Still optional:** define the canvas in `BRANDBOOK.md` + pin the visual contract in the smoke harness.
- **Real-time co-editing** — `edit_sessions` table exists; no live CRDT/WebSocket sync yet.
- **Packaging** — macOS builds (unsigned ad-hoc path agreed), auto-updater (needs signing keys + `tauri-plugin-updater`), Windows code signing — deferred to public launch. Helm charts for the hosted stack.
- **`.iw` custom file format** — per-category on-disk files so non-vault projects also live on disk (depends on stable vault UX, which exists now).
- **Server hygiene** — the gateway is now a single `/api/v1` tree (no legacy duplicate) and all collab/billing/workspace handlers are on `Endpoint[]` except the intentionally-manual `PaddleWebhook` (raw body for signature checks). The admin `GetSubscriptions` per-row usage fan-out is gone: a `GetBatchUsage` billing RPC now returns lifetime totals + current-month sums for the whole page in two grouped queries (Redis stays authoritative for monthly metrics via overlay). No remaining known hygiene items.
- **Client** — eslint flat-config migration (required to bump `eslint-config-next` to 16); element-domain physical rename (`script_elements` table) left as plumbing.

See `CLAUDE.md` for full architecture, the storage abstraction, and the complete deferred-work list.

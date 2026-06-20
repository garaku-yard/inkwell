# Inkwell — Project Status

> Living status of what's shipped, what's partial, and what's planned. Kept in
> sync with the architecture + handoff detail in `CLAUDE.md`.
> Last synced: 2026-06-17.

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
| Screenplay | ✅ | element types, scene/character autocomplete, pagination, FDX + PDF export, FDX import |
| Prose, Poetry / Lyrics, Comic, TTRPG, Interactive Fiction, Memoir | ✅ | per-format element vocabularies, screenplay-class keyboard parity, format-specific export (EPUB / ChordPro / CBZ / Twee / txt / md) |
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
- **Desktop login — BUILT (optional account-link). Sync engine next.** The Tauri build can now sign into a cloud account: token auth (the gateway returns the JWT in-body for `X-Inkwell-Client: desktop`, stored in the OS keychain and replayed as `Authorization: Bearer`; CORS/CSRF exempt token clients so the webview's `tauri://localhost` origin works). It's an *optional link* — the app still runs fully offline with no account and all data stays in local SQLite; `me()` returns the real account when linked, else the local profile, so there's never a forced login gate. Gateway defaults to `https://inkwell.garakuyard.com` with a Settings → Account override for self-hosters. Known gap: 24h token, **no refresh** yet (re-login after expiry) — small follow-up. **End-to-end webview click-through not yet run on a desktop build** (server verified live; client unit-tested + static-export clean). **Sync engine** (local SQLite ↔ cloud scripts-service: push/pull/conflict) is the single biggest vertical and is what login unblocks — sequenced next, nothing built yet.
- **Mobile (Android/iOS)** — Tauri v2 targets mobile, so it's mechanically possible, but a *large* vertical for this app: the vault's arbitrary-folder filesystem model + recursive watcher, the OS keychain (BYO keys), the desktop window chrome, and the keyboard-centric editor UX don't map to mobile sandboxing/touch. Cleanest path is a hosted-first thin client (remote storage), which is gated behind the desktop-login/sync work above. Revisit AFTER desktop login + sync.
- **Editor UI/UX consistency + brand identity** — the editor surfaces feel off and diverge a lot across the nine formats: each editor (Prose / Poetry / Comic / TTRPG / IF / Memoir / Lyrics / Vault) looks and behaves differently from the screenplay editor, which reads as the "reference." Goal: a single, intentional editor design language — consistent canvas, typography rhythm, element/toolbar treatment, spacing, empty states, and interaction model — shared by all nine, so they feel like one product. Make the editor's look a deliberate part of the brand (define it in `BRANDBOOK.md`: the writing canvas as a signature surface, not just shadcn defaults). Cross-cutting design+refactor pass over `components/editor/*` and the shared `EditorHeader` / `EditorPane` / `EmptyEditorState`; pin the visual contract with the smoke-test harness. Substantial — its own focused design pass.
- **Real-time co-editing** — `edit_sessions` table exists; no live CRDT/WebSocket sync yet.
- **Packaging** — macOS builds (unsigned ad-hoc path agreed), auto-updater (needs signing keys + `tauri-plugin-updater`), Windows code signing — deferred to public launch. Helm charts for the hosted stack.
- **`.iw` custom file format** — per-category on-disk files so non-vault projects also live on disk (depends on stable vault UX, which exists now).
- **Server hygiene** — the gateway is now a single `/api/v1` tree (no legacy duplicate) and all collab/billing/workspace handlers are on `Endpoint[]` except the intentionally-manual `PaddleWebhook` (raw body for signature checks). The admin `GetSubscriptions` per-row usage fan-out is gone: a `GetBatchUsage` billing RPC now returns lifetime totals + current-month sums for the whole page in two grouped queries (Redis stays authoritative for monthly metrics via overlay). No remaining known hygiene items.
- **Client** — eslint flat-config migration (required to bump `eslint-config-next` to 16); element-domain physical rename (`script_elements` table) left as plumbing.

See `CLAUDE.md` for full architecture, the storage abstraction, and the complete deferred-work list.

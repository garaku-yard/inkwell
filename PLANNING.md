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
- **Desktop login + sync engine** — bring auth to the Tauri build (currently local-only), then a sync engine (local SQLite ↔ cloud scripts-service: push/pull/conflict). Sync is the single biggest vertical; there is no sync today. Sequenced next: login first, then sync.
- **Mobile (Android/iOS)** — Tauri v2 targets mobile, so it's mechanically possible, but a *large* vertical for this app: the vault's arbitrary-folder filesystem model + recursive watcher, the OS keychain (BYO keys), the desktop window chrome, and the keyboard-centric editor UX don't map to mobile sandboxing/touch. Cleanest path is a hosted-first thin client (remote storage), which is gated behind the desktop-login/sync work above. Revisit AFTER desktop login + sync.
- **Real-time co-editing** — `edit_sessions` table exists; no live CRDT/WebSocket sync yet.
- **Packaging** — macOS builds (unsigned ad-hoc path agreed), auto-updater (needs signing keys + `tauri-plugin-updater`), Windows code signing — deferred to public launch. Helm charts for the hosted stack.
- **`.iw` custom file format** — per-category on-disk files so non-vault projects also live on disk (depends on stable vault UX, which exists now).
- **Server hygiene** — consolidate the duplicate legacy vs `/api/v1` gateway route trees; finish the `Endpoint[]`/`Wrap[]` rollout for the remaining collab/billing handlers; enforce `user_tag`-style invariants where still TODO.
- **Client** — eslint flat-config migration (required to bump `eslint-config-next` to 16); element-domain physical rename (`script_elements` table) left as plumbing.

See `CLAUDE.md` for full architecture, the storage abstraction, and the complete deferred-work list.

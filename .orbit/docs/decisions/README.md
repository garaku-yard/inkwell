# Decisions (ADRs)

> The why-log. **Append-only and immutable** — a decision that turns out wrong is
> *superseded* by a new ADR, never edited in place. Each entry records Context ·
> Decision · **Alternatives considered & why not** · Consequences · Status. The
> rejected alternatives are the point: they're what would otherwise walk out the
> door when someone leaves.

Most of these were **recovered** during the docs migration — they were real,
deliberate choices reflected in the code, the design docs (`SYNC_DESIGN.md`,
`DRIVE_BACKUP.md`), git history, and the maintainer's decision record, but had
never been written up as ADRs.

| # | Decision | Status |
|---|---|---|
| [0001](./0001-local-first-architecture.md) | Local-first architecture; hosted stack optional | Accepted |
| [0002](./0002-tauri-not-electron.md) | Tauri (not Electron) for the desktop shell | Accepted |
| [0003](./0003-polyform-noncommercial-license.md) | PolyForm Noncommercial 1.0.0 license | Superseded by [0028](./0028-polyform-shield-supersedes-noncommercial.md) |
| [0004](./0004-storage-abstraction.md) | One `Storage` interface, local + remote impls | Accepted |
| [0005](./0005-frameless-themed-titlebar.md) | Frameless transparent themed titlebar | Accepted |
| [0006](./0006-vault-notes-as-files.md) | Vault notes are real `.md` files on disk | Accepted |
| [0007](./0007-gateway-thin-proxy-db-per-service.md) | Gateway as thin proxy; one DB per service | Partially superseded by [0029](./0029-gateway-application-gateway-service-authorities.md), [0030](./0030-role-aware-project-authorization-policy.md) |
| [0008](./0008-byo-key-ai-only.md) | BYO-key AI only; delete the Python AI service | Accepted |
| [0009](./0009-openai-compatible-allowlist.md) | `openai_compatible` operator allowlist | Accepted |
| [0010](./0010-aes-gcm-key-vault.md) | AES-256-GCM key vault with AAD binding | Accepted |
| [0011](./0011-identity-model-b.md) | Identity Model B — `(username, user_tag)` unique | Accepted |
| [0012](./0012-engine-plus-config-over-baseeditor.md) | Engine + per-format config over `<BaseEditor>` | Accepted |
| [0013](./0013-sync-client-uuid-lww.md) | Sync: client-UUID authoritative, LWW, opt-in, DB-only | Accepted |
| [0014](./0014-sync-incremental-outbox.md) | Sync: incremental outbox push (supersedes full-snapshot) | Accepted |
| [0015](./0015-sync-time-based-gc.md) | Sync: time-based tombstone GC, not watermark | Accepted |
| [0016](./0016-iw-portable-project-file.md) | `.iw` portable project file — import/export only | Accepted |
| [0017](./0017-optional-desktop-login.md) | Optional desktop login; keychain token auth | Accepted |
| [0018](./0018-org-model-option-b.md) | First-class orgs, Option B (org owns projects) | Partially superseded by [0024](./0024-org-projects-held-locally.md) |
| [0019](./0019-realtime-tiered-lww-then-crdt.md) | Real-time: tiered LWW + presence first, CRDT later | Accepted |
| [0020](./0020-monetization-open-core-paddle.md) | Monetization: open-core, Paddle MoR, per-seat tiers | Partially superseded by [0023](./0023-orgs-in-desktop-hybrid-storage.md) |
| [0021](./0021-drive-backup-google-only.md) | Drive backup: Google-only, `drive.file`, one-way | Accepted |
| [0022](./0022-drawing-per-shape-rows.md) | Drawing layer: one row per shape, JSON payload inside | Accepted |
| [0023](./0023-orgs-in-desktop-hybrid-storage.md) | Orgs in the desktop build; hybrid local+remote `Storage` | Accepted |
| [0024](./0024-org-projects-held-locally.md) | Org-owned projects are held locally on the desktop | Accepted |
| [0025](./0025-one-tool-registry-two-consumers.md) | One tool registry: in-app chat + an in-app MCP bridge | Accepted |
| [0026](./0026-local-orgs-when-signed-out.md) | Local organizations when signed out | Accepted |
| [0027](./0027-inkwell-owns-the-destructive-gate.md) | Inkwell owns the gate in front of destructive tool calls | Accepted |
| [0028](./0028-polyform-shield-supersedes-noncommercial.md) | PolyForm Shield 1.0.0 supersedes PolyForm Noncommercial | Accepted |
| [0029](./0029-gateway-application-gateway-service-authorities.md) | Gateway as application gateway/BFF; one authority per fact | Accepted |
| [0030](./0030-role-aware-project-authorization-policy.md) | Role-aware project authorization: typed policy over bypass sentinel | Accepted |
| [0031](./0031-explicit-scripts-access-assertion.md) | Explicit scripts access assertions replace missing identity | Accepted |
| [0032](./0032-gateway-owned-hosted-tool-loop.md) | The gateway owns the hosted tool loop | Accepted |

**Adding one:** next number, same five headings. If it reverses an earlier
decision, set the old one's Status to `Superseded by NNNN` (that one edit to the
header is the only permitted change to a past ADR) and explain the reversal in the
new one.

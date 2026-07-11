# 0021 — Google Drive backup: Google-only, `drive.file`, one-way

**Status:** Accepted (scoped, not built) · locked 2026-06-22

## Context

Users want a copy of their work in their **own** cloud, independent of Inkwell's
first-party sync. The original Integrations item was a broad "cloud-storage OAuth
(Drive/Dropbox/OneDrive)"; it needed narrowing to the smallest valuable, cheapest
slice. Full design: [log/2026-06-22-drive-backup-design.md](../log/2026-06-22-drive-backup-design.md).

## Decision

- **Google Drive only.**
- **`drive.file` scope** — the app can manage only files it created (its own
  `Inkwell/` tree), never the user's existing Drive.
- **One-way (upload only)** manual backup ("Back up all now"); Drive is a backup
  target, not a second source of truth.
- **All projects**: vault → real files; non-vault → a lossless `.inkwell.json`
  (same envelope as [0016](./0016-iw-portable-project-file.md)) + a readable PDF.
- **Desktop-only**, inert until the operator sets a `client_id`.

## Alternatives considered & why not

- **Dropbox / OneDrive too.** Rejected: each adds its own OAuth app, REST API, and
  change model for little marginal value — Google covers the common case.
- **Full `drive` scope.** Rejected: it's a *restricted* scope requiring a paid
  **CASA security assessment** (~$500–4,500/yr). `drive.file` is non-restricted →
  **$0**, and the app never needs to read the user's other files anyway.
- **Two-way sync with Drive.** Rejected: first-party sync already does true
  multi-device sync ([0013](./0013-sync-client-uuid-lww.md)); this is deliberately
  just "keep a copy in my own cloud," which avoids conflict resolution entirely.

## Consequences

- **Total cost $0** (non-restricted scope, free OAuth app, free brand review).
- Requires a one-time operator step (a free Google Cloud OAuth client); the flow
  ships inert until the `client_id` is configured, mirroring the Paddle pattern.
- Restore-from-Drive is a natural follow-up — the `.inkwell.json` is restore-ready,
  but the importer is a separate task. Tracked on the [roadmap](../roadmap.md).

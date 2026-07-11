# Design log — Google Drive backup (2026-06-22)

> One-way backup of a user's projects to **their own** Google Drive.
> Status: **scoped, not built.** Desktop-only. Sits on top of the desktop
> account-link + sync work ([reference/sync-engine.md](../reference/sync-engine.md)).
> This is the Settings → Integrations "#16" item, narrowed from the original
> "cloud-storage OAuth (Drive/Dropbox/OneDrive)" to the smallest valuable slice.
> Migrated verbatim from the root `DRIVE_BACKUP.md`.
>
> The **locked decisions** are in the append-only log:
> [decisions/0021 — Drive-only, `drive.file`, one-way](../decisions/0021-drive-backup-google-only.md).
> This doc is the design/scope; that ADR is the why + rejected alternatives.

## Goal

Let a desktop user connect their Google account once and **back up every project
to their own Drive** with a manual "Back up now". One-way (push only): Drive is a
mirror/backup target, not a second source of truth. Cross-device *sync* is already
covered by the first-party engine; this is "keep a copy in my own cloud."

## Scope

- **Vault projects** → their real on-disk files (`.md` + attachments), uploaded
  as-is (folder tree preserved).
- **Non-vault projects** live in SQLite, so each is backed up as **two files**:
  - `<title>.inkwell.json` — a **lossless** snapshot (all rows) for restore.
  - `<title>.pdf` — a **readable** copy.
- **Trigger:** manual only ("Back up all now"). No scheduled/auto backup in v1.

## Architecture — five pieces

### 1. Google OAuth (desktop, `drive.file`)
- **Loopback redirect** (RFC 8252 native-app flow): build the auth URL
  (`client_id`, `redirect_uri=http://127.0.0.1:<ephemeral-port>`,
  `scope=.../auth/drive.file`, `response_type=code`, PKCE `code_challenge`,
  `state`), open it in the system browser (Tauri opener), and run a **temporary
  localhost listener** (Rust) to catch the redirect with the `code`. Alternative:
  an `inkwell://` deep link — loopback is simpler and Google-blessed for desktop.
- Exchange `code` + PKCE `code_verifier` → `access_token` + `refresh_token`.
  Refresh on expiry.
- **Token storage: OS keychain**, reusing the BYO-key plumbing
  (`src-tauri/src/secrets.rs`). Store the refresh token; keep the access token in
  memory.
- `client_id` is not secret — lives in config/env, plugged in by the operator.
  Build the flow **inert until `client_id` is set** (same pattern as Paddle).
- **CSP**: the webview already allows `connect-src https:`, so `googleapis.com`
  calls are permitted without a CSP change. Verify.

### 2. Drive client (thin)
A few REST calls over `fetch` with `Authorization: Bearer <access_token>`:
create folder, upload (multipart), update-by-id (`PATCH …?uploadType=media`).
Find-or-create an `Inkwell/` root + per-project subfolder; cache Drive ids locally.

### 3. Local mapping (SQLite migration)
```sql
CREATE TABLE drive_backup (
  project_id    TEXT NOT NULL,
  path          TEXT NOT NULL,  -- vault rel path, or "<title>.inkwell.json" / ".pdf"
  drive_file_id TEXT NOT NULL,  -- enables update-in-place
  synced_hash   TEXT NOT NULL,  -- sha-256 of SOURCE content; skip unchanged
  PRIMARY KEY (project_id, path)
);
CREATE TABLE drive_state (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  account_email  TEXT,
  root_folder_id TEXT
);
```
Reuse the sha-256 helper from `lib/storage/local/vault-sync.ts`.

### 4. Backup engine (one-way, manual)
Per project: ensure its Drive folder exists.
- **Vault**: walk files (reuse `walkAllFiles`); hash each; if
  `hash != synced_hash`, upload (update by id if present, else create) + record.
- **Non-vault**: hash the project's **source rows**. If unchanged, skip both
  files. If changed: serialize the lossless JSON → upload `<title>.inkwell.json`;
  render the PDF → upload `<title>.pdf`. (Hash the source, not the rendered PDF,
  so a nondeterministic renderer doesn't force a re-upload.)
- **Deletes**: a removed project/file is left in Drive in v1 (backup keeps
  history). Trashing-on-delete is an open question.

### 5. UI (Settings → Integrations)
Replace the "Coming soon" placeholder: **Connect Google Drive** / **Disconnect**
(shows account email); **Back up all now** + status + last-backup time. Honest
copy: one-way, desktop-only.

## Serialization details

- **Lossless JSON snapshot**: a versioned envelope
  `{ "inkwellBackup": 1, "project": {...}, "scenes": […], "elements": […],
  "characters": […], "locations": […], "beats": […], "connections": […],
  "lanes": […], "outlineItems": […] }` — read straight from the local tables.
  Same envelope as the shipped `.iw` file
  ([decisions/0016](../decisions/0016-iw-portable-project-file.md)).
- **PDF**: `jsPDF` (already a dep). Screenplay → reuse
  `lib/export/screenplay-pdf.ts`; other 7 formats → one shared generic renderer
  (title + per-scene heading + element body, paginated). Readable, not perfect.

## Out of scope (v1)

- Two-way sync, pull-from-Drive, conflict resolution.
- Dropbox / OneDrive.
- Automatic / scheduled backups.
- Web build.
- Reading the user's existing Drive (only the app's own `Inkwell/` tree).
- **Restore-from-Drive UI** — the `.inkwell.json` is designed for it, but the
  importer is a separate follow-up.

## Cost — $0

`drive.file` is non-restricted → **no paid CASA assessment** (CASA, ~$500–4,500/yr,
applies only to restricted scopes like full `drive`, which we don't use).
Unverified app runs with up to 100 test users; public verification for
`drive.file` is a free brand review, no audit.

## Prerequisites (operator, one-time)

A free **Google Cloud OAuth client**: OAuth consent screen (External; scope
`.../auth/drive.file`; app name + privacy-policy URL); an OAuth client of type
**Desktop app** → `client_id`; drop it into config to activate the flow.

## Suggested stages (~2 sessions)

1. OAuth loopback + keychain token + Connect/Disconnect UI (inert until id set).
2. Drive client + `drive_backup`/`drive_state` migration.
3. Backup engine — vault path.
4. Non-vault path — lossless JSON + PDF.
5. "Back up all now" UI + status + end-to-end verify (needs the real `client_id`).

## Open questions for later

- **Delete propagation** — leave in Drive (history) vs move to trash. v1 leaves.
- **Restore-from-Drive** — build the `.inkwell.json` importer.
- **Generic PDF quality** — plain text-flow good enough for non-screenplay?
- **Opt-in granularity** — "back up everything" vs per-project toggle.
- **User deletes the `Inkwell/` folder in Drive** — re-create + re-upload
  (stale `drive_file_id`s 404 → fall back to create).

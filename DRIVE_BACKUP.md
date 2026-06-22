# Google Drive Backup — Design / Scope

> One-way backup of a user's projects to **their own** Google Drive.
> Status: **scoped, not built.** Desktop-only. Sits on top of the desktop
> account-link + sync work (see `SYNC_DESIGN.md`). This is the
> Settings → Integrations "#16" item, deliberately narrowed from the original
> "cloud-storage OAuth (Drive/Dropbox/OneDrive)" to the smallest valuable slice.

## Goal

Let a desktop user connect their Google account once and **back up every project
to their own Drive** with a manual "Back up now". One-way (push only): Drive is a
mirror/backup target, not a second source of truth. Cross-device *sync* is
already covered by the first-party engine in `SYNC_DESIGN.md`; this is "keep a
copy in my own cloud" — a backup, not a sync.

## Decisions (locked in conversation 2026-06-22)

- **Provider: Google Drive only.** Dropbox / OneDrive explicitly out — each would
  add its own OAuth app + REST API + change model for little marginal value.
- **Direction: one-way (upload only).** No pull, no conflict resolution, no
  Drive-side delta. Re-running updates changed files in place and skips unchanged
  ones (hash compare). If the user edits a backed-up file *in* Drive, the next
  backup overwrites it — normal backup semantics.
- **Scope: all projects.**
  - **Vault projects** → their real on-disk files (`.md` + attachments), uploaded
    as-is (folder tree preserved).
  - **Non-vault projects** (screenplay/prose/poetry/comic/ttrpg/if/memoir/lyrics)
    live in SQLite, not as files, so each is backed up as **two files**:
    - `<title>.inkwell.json` — a **lossless** snapshot (all rows) for restore.
    - `<title>.pdf` — a **readable** copy.
- **Trigger: manual only.** A "Back up all now" button. No scheduled/auto backup
  in v1 (no SyncRunner hook).
- **Scope `drive.file` only** — the app can create and manage *only files it
  created*. This is the key cost decision: `drive.file` is non-restricted, so it
  needs **no paid CASA security assessment** (that's only for restricted scopes
  like full `drive`). **Total cost: $0.** It also means the app never reads the
  user's existing Drive — only its own `Inkwell/` backup tree, which is correct
  for a writing app.
- **Desktop-only.** The real files live on the desktop; the web build's data is
  already in our cloud. Gate behind a capability / `isTauri()`.

## Architecture — five pieces

### 1. Google OAuth (desktop, `drive.file`)
- **Loopback redirect** (RFC 8252 native-app flow): build the auth URL
  (`client_id`, `redirect_uri=http://127.0.0.1:<ephemeral-port>`, `scope=
  https://www.googleapis.com/auth/drive.file`, `response_type=code`, PKCE
  `code_challenge`, `state`), open it in the system browser (Tauri opener
  plugin), and run a **temporary localhost listener** (Rust side) to catch the
  redirect with the `code`. Alternative: an `inkwell://` deep link via the
  tauri deep-link plugin — loopback is simpler and Google-blessed for desktop.
- Exchange `code` + PKCE `code_verifier` at the token endpoint → `access_token`
  + `refresh_token`. Refresh on expiry via the refresh token.
- **Token storage: OS keychain**, reusing the existing BYO-key plumbing
  (`src-tauri/src/secrets.rs` → `secret_set/get/delete`). Store the refresh
  token (e.g. key `google_drive_refresh_token`); keep the access token in memory.
- `client_id` is not secret — lives in config/env, plugged in by the operator
  (see Prerequisites). Build the flow **inert until the client_id is set** (same
  build-now/plug-creds-later pattern as Paddle billing).
- **CSP**: the webview already allows `connect-src https:` (per the RAG embedder
  fetch), so calls to `googleapis.com` are permitted without a CSP change. Verify.

### 2. Drive client (thin)
Just a few REST calls over `fetch` with `Authorization: Bearer <access_token>`:
- **create folder** — `POST drive/v3/files` with
  `mimeType=application/vnd.google-apps.folder`, `name`, `parents`.
- **upload (create)** — `POST upload/drive/v3/files?uploadType=multipart`
  (metadata + media).
- **update (by id)** — `PATCH upload/drive/v3/files/{id}?uploadType=media`.
- Find-or-create an `Inkwell/` root folder + a per-project subfolder; cache their
  Drive ids locally (see schema).

### 3. Local mapping (SQLite migration)
```sql
-- One row per backed-up file. drive_file_id enables update-in-place; synced_hash
-- (sha-256 of the SOURCE content) lets a re-run skip unchanged files.
CREATE TABLE drive_backup (
  project_id    TEXT NOT NULL,
  path          TEXT NOT NULL,  -- vault rel path, or "<title>.inkwell.json" / "<title>.pdf"
  drive_file_id TEXT NOT NULL,
  synced_hash   TEXT NOT NULL,
  PRIMARY KEY (project_id, path)
);
-- Connected-account state + folder ids (singleton-ish):
CREATE TABLE drive_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  account_email   TEXT,
  root_folder_id  TEXT
);
-- Per-project Drive folder id (or fold into drive_state keyed by project).
```
Reuse the sha-256 helper from `lib/storage/local/vault-sync.ts`.

### 4. Backup engine (one-way, manual)
For each project:
- Ensure its Drive folder exists (create + store id if missing).
- **Vault**: walk files (reuse `walkAllFiles` from `vault-sync.ts`); for each,
  hash the bytes; if `hash != drive_backup.synced_hash`, upload (update by
  `drive_file_id` if present, else create) and record `drive_file_id` + hash.
- **Non-vault**: compute a hash over the project's **source data** (all rows). If
  unchanged since last backup, skip both files. If changed:
  - serialize the lossless JSON snapshot → upload `<title>.inkwell.json`.
  - render the PDF → upload `<title>.pdf`.
  - (Hash the source data, not the rendered PDF bytes, so a nondeterministic
    renderer doesn't force a re-upload every run.)
- **Deletes**: a project/file removed locally is left in Drive in v1 (backup
  keeps history). Trashing on delete is an open question (below).

### 5. UI (Settings → Integrations)
Replace the "Coming soon" placeholder with:
- **Connect Google Drive** (runs the OAuth flow) / **Disconnect** (clears the
  keychain token + `drive_state`). Shows the connected account email.
- **Back up all now** button + per-project (or overall) status + last-backup time.
- Honest copy: one-way backup, desktop-only.

## Serialization details

- **Lossless JSON snapshot**: a versioned envelope
  `{ "inkwellBackup": 1, "project": {...}, "scenes": [...], "elements": [...],
  "characters": [...], "locations": [...], "beats": [...], "connections": [...],
  "lanes": [...], "outlineItems": [...] }` — read straight from the local tables
  (mirrors the reads the sync engine already does). Restore-ready (the importer
  itself is a separate later task — see open questions).
- **PDF**: `jsPDF` is already a dependency.
  - Screenplay → reuse `lib/export/screenplay-pdf.ts` (properly formatted).
  - Other 7 formats → one shared generic renderer (title + per-scene heading +
    element body text, paginated). Readable, not format-perfect.

## Out of scope (v1)

- Two-way sync, pull-from-Drive, conflict resolution.
- Dropbox / OneDrive.
- Automatic / scheduled backups (manual only).
- Web build (desktop only).
- Reading the user's existing Drive (only the app's own `Inkwell/` tree).
- **Restore-from-Drive UI** — the `.inkwell.json` is *designed* for it, but the
  importer is a separate follow-up.

## Cost — $0

- OAuth app registration, Drive API usage: free.
- `drive.file` is non-restricted → **no paid CASA assessment** (CASA, ~$500–
  $4,500/yr, applies only to restricted scopes like full `drive`, which we don't
  use). See `SYNC_DESIGN.md` history / the conversation that produced this doc.
- Unverified app runs with up to 100 test users (fine for personal/beta);
  public verification for `drive.file` is a free brand review, no audit.

## Prerequisites (operator, one-time)

A free **Google Cloud OAuth client**:
1. Google Cloud project → OAuth consent screen (External; scope
   `.../auth/drive.file`; app name + privacy-policy URL — `inkwell.garakuyard.com`
   + the existing `/privacy` page satisfy this).
2. Create an OAuth client of type **Desktop app** → yields the `client_id`.
3. Drop the `client_id` into config; the flow activates.

## Suggested stages (~2 focused sessions)

1. OAuth desktop loopback flow + keychain token storage + Connect/Disconnect UI
   (inert until `client_id` set).
2. Drive client (folder / upload / update) + `drive_backup` / `drive_state`
   migration.
3. Backup engine — vault files path.
4. Non-vault path — lossless JSON snapshot + PDF (generic renderer + screenplay
   reuse).
5. "Back up all now" UI + status + end-to-end verify (needs the real `client_id`).

## Open questions for later

- **Delete propagation** — leave deleted projects/files in Drive (history) vs
  move to Drive trash. v1 leaves them; revisit.
- **Restore-from-Drive** — build the `.inkwell.json` importer (the natural
  complement; the snapshot format is already restore-ready).
- **Generic PDF quality** — is a plain text-flow PDF good enough for non-
  screenplay formats, or do specific formats deserve their own layout?
- **Opt-in granularity** — "back up everything" vs per-project opt-in toggle.
- **Conflict if the user deletes the `Inkwell/` folder in Drive** — re-create +
  re-upload (drive_file_ids will 404 → fall back to create).

-- Per-project sync state for the desktop sync engine (Stage 3). One row per
-- project the user has opted into cloud sync.
--   enabled        = opted into sync (0/1)
--   cursor         = the server-time high-water last pulled (opaque JSON, '' = none)
--   last_synced_at = local wall-clock of the last successful sync (ISO)
--   status         = idle | syncing | offline | error (for the UI)
--   error          = last error message when status = error
-- See SYNC_DESIGN.md.
CREATE TABLE IF NOT EXISTS sync_state (
  project_id     TEXT PRIMARY KEY,
  enabled        INTEGER NOT NULL DEFAULT 0,
  cursor         TEXT NOT NULL DEFAULT '',
  last_synced_at TEXT,
  status         TEXT NOT NULL DEFAULT 'idle',
  error          TEXT,
  updated_at     TEXT NOT NULL
);

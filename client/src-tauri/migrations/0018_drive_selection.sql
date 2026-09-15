-- Backups require explicit per-project opt-in. This is separate from the
-- Drive-folder mapping because selection exists before a project is uploaded.
CREATE TABLE IF NOT EXISTS drive_selection (
  project_id  TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1))
);

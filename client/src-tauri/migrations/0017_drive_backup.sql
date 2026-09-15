-- Persistent Google Drive backup mappings. Drive is a one-way backup target;
-- these IDs let later runs update files in place and skip unchanged content.
CREATE TABLE IF NOT EXISTS drive_backup (
  project_id    TEXT NOT NULL,
  path          TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  synced_hash   TEXT NOT NULL,
  PRIMARY KEY (project_id, path)
);

CREATE TABLE IF NOT EXISTS drive_project (
  project_id       TEXT PRIMARY KEY,
  drive_folder_id  TEXT NOT NULL,
  folder_name      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drive_folder (
  project_id       TEXT NOT NULL,
  path             TEXT NOT NULL,
  drive_folder_id  TEXT NOT NULL,
  PRIMARY KEY (project_id, path)
);

CREATE TABLE IF NOT EXISTS drive_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  account_email   TEXT,
  root_folder_id  TEXT,
  status          TEXT NOT NULL DEFAULT 'idle'
                    CHECK (status IN ('idle', 'backing_up', 'error')),
  error           TEXT,
  last_backup_at  TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO drive_state (id) VALUES (1);

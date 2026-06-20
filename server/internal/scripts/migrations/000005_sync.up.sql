-- Sync foundation (Stage 1): tombstones + the one missing change-tracking
-- timestamp on the scripts-service tables that participate in cloud sync.
-- Mirrors the desktop SQLite migration 0009. projects already carries deleted_at
-- (it's the existing archive/delete mechanism); outline_units is excluded (no
-- desktop counterpart, not synced in v1). See SYNC_DESIGN.md.

ALTER TABLE scenes           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE script_elements  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE characters       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE locations        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE beats            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE beat_connections ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE lanes            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE outline_items    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- beat_connections is the only synced table without updated_at; add it and seed
-- existing rows from created_at so they order correctly in the sync delta.
ALTER TABLE beat_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
UPDATE beat_connections SET updated_at = created_at;

-- Delta-scan indexes: the sync pull queries every synced table by
-- (project_id, updated_at > cursor).
CREATE INDEX IF NOT EXISTS idx_scenes_project_updated           ON scenes(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_elements_project_updated         ON script_elements(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_characters_project_updated       ON characters(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_locations_project_updated        ON locations(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_beats_project_updated            ON beats(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_beat_connections_project_updated ON beat_connections(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_lanes_project_updated            ON lanes(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_outline_items_project_updated    ON outline_items(project_id, updated_at);

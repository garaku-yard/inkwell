-- Sync foundation (Stage 1): soft-delete tombstones + missing change-tracking
-- timestamps on every table that participates in cloud sync. A nullable
-- deleted_at means NULL = live, a timestamp = a tombstone that propagates the
-- deletion to other devices (later reclaimed by the time-based retention sweep).
-- beats/connections/lanes/outline_items additionally gain updated_at, which they
-- never had, so the sync delta can order their changes. Existing rows are
-- backfilled to the migration time so they all push on first sync. Workspaces
-- are intentionally excluded — they don't sync in v1. See SYNC_DESIGN.md.

-- Tombstone column (nullable; NULL = not deleted).
ALTER TABLE projects        ADD COLUMN deleted_at TEXT;
ALTER TABLE scenes          ADD COLUMN deleted_at TEXT;
ALTER TABLE script_elements ADD COLUMN deleted_at TEXT;
ALTER TABLE characters      ADD COLUMN deleted_at TEXT;
ALTER TABLE locations       ADD COLUMN deleted_at TEXT;
ALTER TABLE beats           ADD COLUMN deleted_at TEXT;
ALTER TABLE connections     ADD COLUMN deleted_at TEXT;
ALTER TABLE lanes           ADD COLUMN deleted_at TEXT;
ALTER TABLE outline_items   ADD COLUMN deleted_at TEXT;

-- updated_at for the beat-board tables that never carried timestamps.
ALTER TABLE beats         ADD COLUMN updated_at TEXT;
ALTER TABLE connections   ADD COLUMN updated_at TEXT;
ALTER TABLE lanes         ADD COLUMN updated_at TEXT;
ALTER TABLE outline_items ADD COLUMN updated_at TEXT;

-- Backfill the new updated_at so existing rows are syncable on first sync.
-- strftime matches the ISO-8601 millisecond shape of the app's now().
UPDATE beats         SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE connections   SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE lanes         SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE outline_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;

-- Partial indexes for the common "live rows of a project" reads, which now all
-- carry `deleted_at IS NULL`.
CREATE INDEX IF NOT EXISTS idx_scenes_project_live        ON scenes(project_id)          WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_elements_scene_live        ON script_elements(scene_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_elements_project_live      ON script_elements(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_characters_project_live    ON characters(project_id)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_locations_project_live     ON locations(project_id)       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_beats_project_live         ON beats(project_id)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_connections_project_live   ON connections(project_id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lanes_project_live         ON lanes(project_id)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outline_items_project_live ON outline_items(project_id)   WHERE deleted_at IS NULL;

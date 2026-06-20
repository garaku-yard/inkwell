DROP INDEX IF EXISTS idx_scenes_project_updated;
DROP INDEX IF EXISTS idx_elements_project_updated;
DROP INDEX IF EXISTS idx_characters_project_updated;
DROP INDEX IF EXISTS idx_locations_project_updated;
DROP INDEX IF EXISTS idx_beats_project_updated;
DROP INDEX IF EXISTS idx_beat_connections_project_updated;
DROP INDEX IF EXISTS idx_lanes_project_updated;
DROP INDEX IF EXISTS idx_outline_items_project_updated;

ALTER TABLE beat_connections DROP COLUMN IF EXISTS updated_at;

ALTER TABLE scenes           DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE script_elements  DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE characters       DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE locations        DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE beats            DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE beat_connections DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE lanes            DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE outline_items    DROP COLUMN IF EXISTS deleted_at;

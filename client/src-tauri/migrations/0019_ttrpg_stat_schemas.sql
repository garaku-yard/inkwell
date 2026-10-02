-- Project-owned stat schemas travel with the project row during cloud sync.
-- Legacy freeform stat blocks remain unchanged.
ALTER TABLE projects ADD COLUMN ttrpg_stat_schemas_json TEXT NOT NULL DEFAULT '[]';

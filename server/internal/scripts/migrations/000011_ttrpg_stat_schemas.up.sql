ALTER TABLE projects ADD COLUMN ttrpg_stat_schemas_json JSONB NOT NULL DEFAULT '[]'::jsonb;

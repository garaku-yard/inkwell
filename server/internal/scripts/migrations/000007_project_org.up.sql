-- A project can belong to an organization (Stage 2 of the org model). NULL =
-- a personal project owned by owner_id; non-NULL = an org project whose access
-- is granted by org membership. Additive and nullable, so every existing
-- project stays personal with no data migration.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id) WHERE org_id IS NOT NULL;

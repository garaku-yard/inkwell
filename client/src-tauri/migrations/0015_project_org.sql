-- Org-owned projects, held locally (decisions/0024).
--
-- 0018 put an org's project pool on the server, so the desktop had nowhere to
-- record which org a project belongs to and `local/projects.ts` silently dropped
-- the org_id it was handed: selecting an org and creating a project produced a
-- personal one that never appeared in the org it was made from. That is the
-- wrong trade for a local-first app (0001) — an org project is still just a
-- project on this disk, and waiting on a server to make one contradicts every
-- other thing the desktop does offline.
--
-- Nullable on purpose: NULL means personal, which is what every existing row is
-- and what the overwhelming majority stay. That also makes this migration a pure
-- add — no backfill, nothing to rewrite, and an older build reading this DB just
-- ignores the column (SQLite tolerates unknown columns on SELECT *; the sqlx
-- migration guard is what actually stops a downgrade, see 0023's fallout).
--
-- The column is a bare TEXT with no REFERENCES: orgs live on the server, there is
-- no local organizations table to point at, and inventing one would duplicate
-- membership/seat state this device has no authority over.

ALTER TABLE projects ADD COLUMN org_id TEXT;

-- The dashboard asks exactly two questions — "personal projects" (org_id IS NULL)
-- and "this org's projects" (org_id = ?) — so one partial-friendly index on the
-- column serves both. Rows are few enough that this is cheap either way.
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id, updated_at);

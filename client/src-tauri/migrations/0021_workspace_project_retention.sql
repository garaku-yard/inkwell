-- Personal workspaces group projects by format. When the last workspace for a
-- format disappears, keep its projects recoverable for 30 days before deletion.
-- This marker is local-only: cloud sync does not receive a project tombstone
-- until the recovery window expires.
ALTER TABLE projects ADD COLUMN workspace_removed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_workspace_removed_at ON projects(workspace_removed_at);

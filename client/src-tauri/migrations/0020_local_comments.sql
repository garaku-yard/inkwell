-- Comments in the desktop editor and MCP bridge are stored locally. Their
-- project and target IDs are stable; cloud comment sync is a separate concern.
CREATE TABLE local_comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  is_scene INTEGER NOT NULL DEFAULT 0,
  user_name TEXT NOT NULL DEFAULT 'You',
  content TEXT NOT NULL,
  is_resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_local_comments_project ON local_comments(project_id, created_at);

-- Knowledge scope mapping. A non-vault project (screenplay, prose, etc.)
-- can wire one or more scopes of a vault as AI chat context. Each row says
-- "project_id draws on this slice of vault_project_id":
--
--   scope_type = 'vault'  -> the whole vault (scope_value = '')
--   scope_type = 'folder' -> notes under a relative folder (scope_value = path)
--   scope_type = 'tag'    -> notes carrying a #tag (scope_value = tag text)
--
-- A project can mix several rows (e.g. one folder plus one tag). The
-- composite PK keeps a given (project, vault, type, value) tuple unique.
-- `project_id` is the CONSUMING project; `vault_project_id` is the source
-- vault whose embeddings (see `note_embeddings`) get retrieved.

CREATE TABLE IF NOT EXISTS project_knowledge (
  project_id       TEXT NOT NULL,
  vault_project_id TEXT NOT NULL,
  scope_type       TEXT NOT NULL,
  scope_value      TEXT NOT NULL DEFAULT '',
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (project_id, vault_project_id, scope_type, scope_value)
);

CREATE INDEX IF NOT EXISTS idx_project_knowledge_project
  ON project_knowledge(project_id);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_vault
  ON project_knowledge(vault_project_id);

-- Vault-as-knowledge embedding index. When a non-vault project wires a
-- vault as AI context (see `project_knowledge`), we chunk every note in
-- scope and store a local sentence-embedding per chunk so the chat panel
-- can retrieve the most relevant passages without re-reading the vault.
--
-- `project_id` is the VAULT project that owns the .md file — embeddings
-- belong to the source vault, not the consuming project, so several
-- projects can share one vault's index. Notes live on disk, so a chunk is
-- keyed by `(project_id, filename, chunk_idx)` the same way `note_links`
-- keys by `(project_id, from_filename, ...)`.
--
-- `vector` holds a base64-encoded little-endian Float32Array (384 dims for
-- all-MiniLM-L6-v2). We store it as TEXT rather than BLOB because the
-- SQL plugin's BLOB parameter binding is unreliable, and brute-force
-- cosine ranking reads every vector back into JS regardless. `content_hash`
-- lets the re-index skip chunks whose source text hasn't changed.

CREATE TABLE IF NOT EXISTS note_embeddings (
  project_id   TEXT    NOT NULL,
  filename     TEXT    NOT NULL,
  chunk_idx    INTEGER NOT NULL,
  text         TEXT    NOT NULL,
  vector       TEXT    NOT NULL,
  content_hash TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  PRIMARY KEY (project_id, filename, chunk_idx)
);

CREATE INDEX IF NOT EXISTS idx_note_embeddings_note
  ON note_embeddings(project_id, filename);
CREATE INDEX IF NOT EXISTS idx_note_embeddings_project
  ON note_embeddings(project_id);

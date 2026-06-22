-- Vault file sync: server-side store for a vault project's files. Vault notes
-- are real files on the user's disk (markdown + attachments); the cloud needs a
-- place to hold their content so they can sync across devices. Unlike the
-- structured scripts entities (UUID-keyed rows), vault files are keyed by their
-- vault-relative PATH — that's the natural identity for a folder of files.
--
-- content is BYTEA so the one table holds both markdown (UTF-8 bytes) and binary
-- attachments (images/PDFs). content_hash (sha-256 hex) lets a client skip a
-- byte-for-byte-identical file. deleted_at is a tombstone (NULL = live) so deletes
-- propagate; reclaimed later by the same time-based GC as the row tables. The
-- delta index orders by (updated_at, path) for keyset-paginated pulls. See
-- SYNC_DESIGN.md.

CREATE TABLE IF NOT EXISTS vault_files (
    project_id   UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    path         TEXT NOT NULL,
    content      BYTEA NOT NULL DEFAULT ''::bytea,
    content_hash TEXT NOT NULL DEFAULT '',
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMP,
    PRIMARY KEY (project_id, path)
);

CREATE INDEX IF NOT EXISTS idx_vault_files_delta ON vault_files(project_id, updated_at, path);

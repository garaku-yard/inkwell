-- Vault file sync (client manifest). Vault projects sync their files (markdown +
-- attachments) to the cloud through a separate, path-keyed engine — vault notes
-- are files on disk, not the UUID rows the DB sync handles. This table is the
-- per-file MANIFEST: synced_hash is the content hash each path had at the last
-- successful sync, i.e. the common base. A sync walks the vault, hashes each
-- file, and diffs against this manifest to classify every file as created /
-- modified / deleted locally — clock-independent change detection, the same idea
-- as the DB engine's sync_outbox but for files. The manifest is also the echo
-- guard: when the engine writes a pulled file to disk it records the new hash
-- here, so the filesystem watcher firing on that write never looks like a fresh
-- local edit.
--
-- Per-project enabled/cursor/status reuse the existing sync_state table; only the
-- cursor format differs (a vault keyset position, stored as opaque JSON). See
-- SYNC_DESIGN.md.

CREATE TABLE IF NOT EXISTS vault_manifest (
  project_id  TEXT NOT NULL,
  path        TEXT NOT NULL,
  synced_hash TEXT NOT NULL,
  PRIMARY KEY (project_id, path)
);

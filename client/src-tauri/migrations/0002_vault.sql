-- Vault (Obsidian-style) support. Notes themselves live on disk as `.md`
-- files in a user-chosen folder — SQLite only persists the pointer to that
-- folder and (eventually) an index for fast link/search queries.
--
-- For the MVP we just need the pointer. Future migrations will add:
--   - note_index (title, path, content_hash, updated_at) — cache layer
--   - note_links (from_note_id, to_title, resolved_to_note_id) — backlinks

ALTER TABLE projects ADD COLUMN vault_path TEXT;

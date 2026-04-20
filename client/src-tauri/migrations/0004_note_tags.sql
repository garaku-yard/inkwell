-- Tags index. We parse `#tag` / `#nested/tag` out of every note the same
-- way `note_links` captures `[[wikilinks]]`. Tag text is stored with its
-- original casing so the sidebar can display "Reading" not "reading", but
-- lookups use `COLLATE NOCASE` to stay case-insensitive.

CREATE TABLE IF NOT EXISTS note_tags (
  project_id    TEXT NOT NULL,
  from_filename TEXT NOT NULL,
  tag           TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (project_id, from_filename, tag)
);

CREATE INDEX IF NOT EXISTS idx_note_tags_tag
  ON note_tags(project_id, tag COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_note_tags_source
  ON note_tags(project_id, from_filename);

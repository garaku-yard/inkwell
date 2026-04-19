-- Backlinks index. Notes themselves stay on disk; this table caches the
-- `[[target]]` references we parse out of them so the backlinks panel
-- doesn't have to re-read the entire vault on every note switch.
--
-- `to_title` stores the unfolded target — `[[Page|Alias]]` becomes
-- `Page`, `[[Page]]` stays `Page`. We query with `COLLATE NOCASE` to
-- stay case-insensitive without an extra lower()'d column.

CREATE TABLE IF NOT EXISTS note_links (
  project_id    TEXT NOT NULL,
  from_filename TEXT NOT NULL,
  to_title      TEXT NOT NULL,
  snippet       TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (project_id, from_filename, to_title)
);

CREATE INDEX IF NOT EXISTS idx_note_links_target
  ON note_links(project_id, to_title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_note_links_source
  ON note_links(project_id, from_filename);

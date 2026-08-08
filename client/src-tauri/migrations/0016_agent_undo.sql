-- Undo journal for destructive agent tool calls (ADR 0027, stage 4 of 0025).
--
-- Every destructive tool already leaves its damage recoverable on disk:
-- `scenes.delete` soft-deletes and cascades `deleted_at` to the scene's
-- elements, and `rewrite_scene` soft-deletes the old elements only after the
-- replacement is committed. The rows are all still there. What was missing is a
-- record of *which* rows a given call touched, without which "undo that" means
-- guessing from timestamps.
--
-- One row per destructive call. The three id lists are what undo replays:
-- `scene_ids` and `restore_element_ids` get their `deleted_at` cleared,
-- `remove_element_ids` get theirs set. Stored as JSON arrays because nothing
-- queries inside them — undo reads the whole row or none of it — and a join
-- table would cost a second migration the first time a tool touches a third
-- kind of row.
--
-- **Local-only, deliberately.** No write here calls `markDirty`, so the journal
-- never enters the sync outbox and never reaches the gateway. It describes one
-- device's local history of agent actions; replaying another device's undo
-- against this one's rows is meaningless, and the restore itself *does* mark the
-- restored rows dirty, so the outcome syncs even though the journal doesn't.
--
-- Not born sync-ready (unlike `drawings` in 0014) for that reason: the columns
-- that would make it syncable would be lying about what it is.

CREATE TABLE IF NOT EXISTS agent_undo (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- The registry tool name, e.g. delete_scene | rewrite_scene.
  tool                TEXT NOT NULL,
  -- chat | mcp — which consumer ran it, so the list can say where it came from.
  source              TEXT NOT NULL,
  -- Writer-facing sentence, composed by the tool: 'Deleted "The Briefing"'.
  summary             TEXT NOT NULL,
  -- JSON arrays of row ids. See the note above for what undo does with each.
  scene_ids           TEXT NOT NULL DEFAULT '[]',
  restore_element_ids TEXT NOT NULL DEFAULT '[]',
  remove_element_ids  TEXT NOT NULL DEFAULT '[]',
  created_at          TEXT NOT NULL,
  -- Set once undone, so the entry stays as history instead of being deleted and
  -- the list can show what has already been reversed.
  undone_at           TEXT
);

-- The panel reads the recent entries for one project, newest first.
CREATE INDEX IF NOT EXISTS idx_agent_undo_project ON agent_undo(project_id, created_at DESC);

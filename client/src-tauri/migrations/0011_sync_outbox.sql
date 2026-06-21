-- Incremental-push change log for the desktop sync engine (Stage 3 follow-up).
--
-- v1 sync pushed a FULL snapshot of the project every round, which silently lost
-- cross-device edits: the server stamps every pushed row updated_at = NOW() and
-- excludes it from the pull, so a device that re-pushes a row it never changed
-- both clobbers the server's newer copy AND excludes that row from its own pull
-- (never learning the remote edit). Last device to sync won the whole project.
--
-- The fix is to push only rows that actually changed locally. Each local mutation
-- records (project_id, entity_type, row_id) here; a sync drains the log and pushes
-- just those rows, then deletes the drained entries. An idle/stale device has an
-- empty log, so it pushes nothing — it neither clobbers nor mis-excludes, and
-- pulls other devices' edits normally. See SYNC_DESIGN.md ("incremental push").
--
-- The apply path (writing pulled server rows) deliberately does NOT append here,
-- which is what prevents a pulled row from echoing straight back as a local edit.
-- Appends are gated on the project being sync-enabled (INSERT…SELECT…WHERE EXISTS
-- in markDirty), so projects the user never syncs accumulate nothing.

CREATE TABLE IF NOT EXISTS sync_outbox (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  row_id      TEXT NOT NULL,
  op          TEXT NOT NULL DEFAULT 'upsert',
  created_at  TEXT NOT NULL
);

-- Drained per project, ordered/bounded by seq (only entries up to the captured
-- high-water are deleted, so edits made mid-sync survive to the next round).
CREATE INDEX IF NOT EXISTS idx_sync_outbox_project ON sync_outbox(project_id, seq);

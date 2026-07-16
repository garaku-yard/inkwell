-- Drawing layer for the beat-board canvas (decisions/0022).
--
-- One row per shape, not one blob per board. Sync's unit of granularity is the
-- row, so a whole-layer blob would collapse every stroke into a single
-- last-sync-wins cell: two devices drawing means one loses the entire layer, and
-- a stale device that merely opens the board would re-push its old blob over the
-- other's work — the exact clobber the incremental outbox (0014 ADR) removed.
--
-- The shape's geometry and style live in `data` as JSON. Nothing queries inside a
-- shape (the server stores and returns it), so typed columns per shape kind would
-- buy nothing and cost a migration on both SQLite and Postgres every time a new
-- kind is added. `kind` stays a plain string for the same reason.
--
-- Unlike beats/lanes/connections — which predate sync and had updated_at and
-- deleted_at bolted on in 0009 — this table is born sync-ready.

CREATE TABLE IF NOT EXISTS drawings (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- pen | line | rect | ellipse | arrow — free-form on purpose (see above).
  kind        TEXT NOT NULL,
  -- JSON: {points:[{x,y}...] | x,y,w,h | x1,y1,x2,y2} + {color,width,fill}.
  data        TEXT NOT NULL DEFAULT '{}',
  -- z-order within the layer; ties broken by created_at.
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- The board reads live shapes for one project in z-order; the sync delta scans
-- by updated_at. Mirrors idx_beats_project.
CREATE INDEX IF NOT EXISTS idx_drawings_project ON drawings(project_id, order_index);

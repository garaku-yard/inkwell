-- Beat-board drawing layer: one row per shape (decisions/0022).
--
-- Sync's unit of granularity is the row, so a whole-layer JSON blob would make
-- the entire drawing a single last-sync-wins cell — two devices drawing means
-- one loses everything. Per-shape rows get per-shape conflicts and tombstones
-- from the machinery that already exists.
--
-- `data` is JSONB-free on purpose: it's TEXT. The server never reads inside a
-- shape (no query filters on geometry), so JSONB would buy parsing and
-- validation costs on every write for nothing, and would reject a payload the
-- client considers valid. It's an opaque string end to end.

CREATE TABLE IF NOT EXISTS drawings (
    drawing_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    -- pen | line | arrow | rect | ellipse; free-form so a new kind costs no migration.
    kind        VARCHAR(32) NOT NULL,
    -- Opaque JSON: geometry (points) + style.
    data        TEXT NOT NULL DEFAULT '{}',
    -- z-order within the layer. Named drawing_order because "order" is reserved.
    drawing_order INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP
);

-- Reading a board's live shapes.
CREATE INDEX IF NOT EXISTS idx_drawings_project_id ON drawings(project_id);
-- The sync delta scan, matching every other synced table (see 000005_sync).
CREATE INDEX IF NOT EXISTS idx_drawings_project_updated ON drawings(project_id, updated_at);
-- Tombstone GC sweeps by age.
CREATE INDEX IF NOT EXISTS idx_drawings_deleted_at ON drawings(deleted_at);

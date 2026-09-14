ALTER TABLE identity_outbox
    ADD COLUMN claimed_at TIMESTAMPTZ,
    ADD COLUMN claimed_by TEXT,
    ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN last_error TEXT,
    ADD COLUMN dead_lettered_at TIMESTAMPTZ;

DROP INDEX IF EXISTS idx_identity_outbox_unpublished;
CREATE INDEX idx_identity_outbox_pending ON identity_outbox (created_at)
    WHERE published_at IS NULL AND dead_lettered_at IS NULL;

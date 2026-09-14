ALTER TABLE billing_outbox
    ADD COLUMN claimed_at TIMESTAMPTZ,
    ADD COLUMN claimed_by TEXT,
    ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN last_error TEXT,
    ADD COLUMN dead_lettered_at TIMESTAMPTZ;
DROP INDEX IF EXISTS idx_billing_outbox_unpublished;
CREATE INDEX idx_billing_outbox_pending ON billing_outbox (created_at)
    WHERE published_at IS NULL AND dead_lettered_at IS NULL;

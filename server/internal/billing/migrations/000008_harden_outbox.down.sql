DROP INDEX IF EXISTS idx_billing_outbox_pending;
ALTER TABLE billing_outbox DROP COLUMN IF EXISTS dead_lettered_at, DROP COLUMN IF EXISTS last_error, DROP COLUMN IF EXISTS attempts, DROP COLUMN IF EXISTS claimed_by, DROP COLUMN IF EXISTS claimed_at;
CREATE INDEX idx_billing_outbox_unpublished ON billing_outbox (created_at) WHERE published_at IS NULL;

DROP INDEX IF EXISTS idx_identity_outbox_pending;
ALTER TABLE identity_outbox
    DROP COLUMN IF EXISTS dead_lettered_at,
    DROP COLUMN IF EXISTS last_error,
    DROP COLUMN IF EXISTS attempts,
    DROP COLUMN IF EXISTS claimed_by,
    DROP COLUMN IF EXISTS claimed_at;
CREATE INDEX idx_identity_outbox_unpublished ON identity_outbox (created_at)
    WHERE published_at IS NULL;

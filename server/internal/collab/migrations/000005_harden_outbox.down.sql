DROP INDEX IF EXISTS idx_collab_outbox_pending;
ALTER TABLE collab_outbox DROP COLUMN IF EXISTS dead_lettered_at, DROP COLUMN IF EXISTS last_error, DROP COLUMN IF EXISTS attempts, DROP COLUMN IF EXISTS claimed_by, DROP COLUMN IF EXISTS claimed_at;
CREATE INDEX idx_collab_outbox_unpublished ON collab_outbox (created_at) WHERE published_at IS NULL;

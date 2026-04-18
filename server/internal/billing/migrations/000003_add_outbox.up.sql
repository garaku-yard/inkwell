-- billing_outbox stores domain events that must be reliably published to Kafka.
-- Events are written in the same DB transaction as the triggering subscription change,
-- then a background poller reads unpublished rows, emits them to Kafka, and marks
-- them published. This prevents event loss if the service crashes between the two steps.
CREATE TABLE IF NOT EXISTS billing_outbox (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type  TEXT        NOT NULL,
    payload     JSONB       NOT NULL,
    published_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_outbox_unpublished ON billing_outbox (created_at)
    WHERE published_at IS NULL;

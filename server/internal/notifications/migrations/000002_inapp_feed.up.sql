-- ─── In-app notification feed ─────────────────────────────────────────────────
-- One row per delivered in-app notification. The consumer writes these when a
-- consumed domain event matches the recipient's preferences.

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,            -- recipient
    type        VARCHAR(64) NOT NULL,            -- source event type, e.g. 'collaboration.added'
    title       TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    link        TEXT,                            -- in-app navigation target, e.g. /projects/<id>
    read_at     TIMESTAMPTZ,                     -- NULL until the user reads it
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;

-- ─── Delivery log (idempotency) ───────────────────────────────────────────────
-- Every domain event is published twice (inline best-effort + outbox poller)
-- with identical payloads but different envelope ids, and may be redelivered by
-- Kafka. The consumer derives a deterministic dedup_key per (channel, event)
-- and records it here inside the same transaction as the delivery, so a repeat
-- is a no-op. The channel prefix ('inapp:' / 'email:') keeps each delivery
-- channel deduped independently for the same logical event.

CREATE TABLE IF NOT EXISTS delivery_log (
    dedup_key   TEXT        PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

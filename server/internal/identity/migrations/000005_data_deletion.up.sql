-- ─── GDPR data-deletion requests ──────────────────────────────────────────────
-- Distinct from account deletion (users.deleted_at). A request to scrub personal
-- data while the account + projects survive. Fulfilment is operator-driven today;
-- this table records and surfaces the request + its status.

CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id                        UUID        PRIMARY KEY,
    user_id                   UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status                    VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at                TIMESTAMP   NOT NULL DEFAULT NOW(),
    completed_at              TIMESTAMP,
    expected_completion_date  TIMESTAMP   NOT NULL
);

-- One active (non-completed) request per user — the partial unique index makes
-- RequestDataDeletion idempotent at the DB level.
CREATE UNIQUE INDEX idx_ddr_one_active_per_user
    ON data_deletion_requests (user_id)
    WHERE status <> 'completed';

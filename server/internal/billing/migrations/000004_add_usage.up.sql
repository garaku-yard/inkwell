-- user_usage_totals is the fast-read aggregate table used for quota checks.
-- Each row is one user × one metric. Services that need to enforce a quota
-- (e.g. scripts checking max_projects before CreateProject) read from here.
CREATE TABLE IF NOT EXISTS user_usage_totals (
    user_id     UUID        NOT NULL,
    metric_name TEXT        NOT NULL,
    total       BIGINT      NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, metric_name)
);

-- usage_events is the append-only log of every individual usage increment.
-- Totals are derived from this via trigger, but we also maintain the
-- aggregate table for O(1) reads on the quota check path.
CREATE TABLE IF NOT EXISTS usage_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,
    metric_name TEXT        NOT NULL,
    quantity    BIGINT      NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_events_user_metric ON usage_events (user_id, metric_name, occurred_at DESC);

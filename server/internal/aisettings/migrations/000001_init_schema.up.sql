-- AI provider BYO configuration for the hosted build. One row per
-- (user, configured provider). API keys live in `encrypted_api_key` +
-- `key_nonce`, encrypted with the service's master key (loaded from the
-- `AI_ENCRYPTION_KEY` env var, AES-256-GCM). `key_version` lets the
-- master key rotate: a future migration would increment the value on
-- write and re-encrypt rows with the older version on next read.

CREATE TABLE IF NOT EXISTS user_ai_providers (
    id                UUID        PRIMARY KEY,
    user_id           UUID        NOT NULL,
    kind              VARCHAR(32) NOT NULL,
    label             VARCHAR(128) NOT NULL,
    enabled           BOOLEAN     NOT NULL DEFAULT TRUE,
    base_url          TEXT,
    default_model     TEXT,
    encrypted_api_key BYTEA,
    key_nonce         BYTEA,
    key_version       INTEGER     NOT NULL DEFAULT 1,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_ai_providers_user ON user_ai_providers(user_id);

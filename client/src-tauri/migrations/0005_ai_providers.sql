-- AI provider configuration for BYO-key setups. API keys are NOT stored
-- here — they live in the OS keychain under `inkwell.ai.<id>` and are
-- accessed through the Rust secrets commands. This table only holds the
-- non-secret metadata needed to render the settings UI and dispatch chat
-- requests: kind, base URL (for local / OpenAI-compatible), default model,
-- and an `enabled` flag so users can keep a configured provider around
-- without it appearing in the chat panel picker.
--
-- `key_version` is reserved for future rotation of the keychain encoding.
-- It is always 1 for now; a later migration that changes how keys are
-- stored (e.g. moving from one service name to another, or bumping the
-- serialisation format) will increment this and re-encode lazily on next
-- read.

CREATE TABLE IF NOT EXISTS ai_providers (
    id            TEXT    PRIMARY KEY,
    kind          TEXT    NOT NULL,
    label         TEXT    NOT NULL,
    enabled       INTEGER NOT NULL DEFAULT 1,
    base_url      TEXT,
    default_model TEXT,
    key_version   INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_enabled ON ai_providers(enabled);

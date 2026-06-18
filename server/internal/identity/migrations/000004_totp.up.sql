-- Two-factor authentication (TOTP). The shared secret is stored encrypted
-- (AES-256-GCM, key derived from JWT_SECRET) as ciphertext + nonce, so a DB
-- leak alone doesn't expose working 2FA secrets. Recovery codes are stored as
-- sha256 hashes and removed from the array as they're consumed at login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_nonce BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes TEXT[] NOT NULL DEFAULT '{}';

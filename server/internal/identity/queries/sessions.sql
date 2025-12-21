-- name: CreateSession :one
INSERT INTO user_sessions (
    user_id, refresh_token_hash, device_info, ip_address, expires_at
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: GetSessionByID :one
SELECT * FROM user_sessions
WHERE session_id = $1 AND is_active = true
LIMIT 1;

-- name: GetActiveSessionsByUserID :many
SELECT * FROM user_sessions
WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
ORDER BY last_used_at DESC;

-- name: UpdateSessionLastUsed :exec
UPDATE user_sessions
SET last_used_at = NOW()
WHERE session_id = $1;

-- name: RevokeSession :exec
UPDATE user_sessions
SET is_active = false, revoked_at = NOW()
WHERE session_id = $1;

-- name: RevokeAllUserSessions :exec
UPDATE user_sessions
SET is_active = false, revoked_at = NOW()
WHERE user_id = $1 AND is_active = true;

-- name: DeleteExpiredSessions :exec
DELETE FROM user_sessions
WHERE expires_at < NOW();

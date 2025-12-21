-- name: CreateUser :one
INSERT INTO users (
    email, username, user_tag, password_hash, first_name, last_name, avatar_url, role
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
) RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users
WHERE user_id = $1 AND deleted_at IS NULL
LIMIT 1;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = $1 AND deleted_at IS NULL
LIMIT 1;

-- name: GetUserByUsername :one
SELECT * FROM users
WHERE username = $1 AND deleted_at IS NULL
LIMIT 1;

-- name: GetUserByUsernameAndTag :one
SELECT * FROM users
WHERE username = $1 AND user_tag = $2 AND deleted_at IS NULL
LIMIT 1;

-- name: UpdateUser :one
UPDATE users
SET
    email = COALESCE(sqlc.narg('email'), email),
    username = COALESCE(sqlc.narg('username'), username),
    first_name = COALESCE(sqlc.narg('first_name'), first_name),
    last_name = COALESCE(sqlc.narg('last_name'), last_name),
    avatar_url = COALESCE(sqlc.narg('avatar_url'), avatar_url),
    role = COALESCE(sqlc.narg('role'), role),
    is_active = COALESCE(sqlc.narg('is_active'), is_active),
    is_verified = COALESCE(sqlc.narg('is_verified'), is_verified),
    email_verified = COALESCE(sqlc.narg('email_verified'), email_verified),
    last_login_at = COALESCE(sqlc.narg('last_login_at'), last_login_at),
    updated_at = NOW()
WHERE user_id = sqlc.arg('user_id') AND deleted_at IS NULL
RETURNING *;

-- name: UpdateUserPassword :exec
UPDATE users
SET password_hash = $2, updated_at = NOW()
WHERE user_id = $1 AND deleted_at IS NULL;

-- name: DeleteUser :exec
UPDATE users
SET deleted_at = NOW()
WHERE user_id = $1;

-- name: ListUsers :many
SELECT * FROM users
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountUsers :one
SELECT COUNT(*) FROM users
WHERE deleted_at IS NULL;

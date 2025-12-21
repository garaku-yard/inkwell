-- name: CreateProject :one
INSERT INTO projects (
    title, description, owner_id, status, is_starred
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: GetProjectByID :one
SELECT * FROM projects
WHERE project_id = $1 AND deleted_at IS NULL
LIMIT 1;

-- name: GetProjectsByOwnerID :many
SELECT * FROM projects
WHERE owner_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC;

-- name: UpdateProject :one
UPDATE projects
SET
    title = COALESCE(sqlc.narg('title'), title),
    description = COALESCE(sqlc.narg('description'), description),
    status = COALESCE(sqlc.narg('status'), status),
    is_starred = COALESCE(sqlc.narg('is_starred'), is_starred),
    updated_at = NOW()
WHERE project_id = sqlc.arg('project_id') AND deleted_at IS NULL
RETURNING *;

-- name: DeleteProject :exec
UPDATE projects
SET deleted_at = NOW()
WHERE project_id = $1;

-- name: CountProjectsByOwnerID :one
SELECT COUNT(*) FROM projects
WHERE owner_id = $1 AND deleted_at IS NULL;

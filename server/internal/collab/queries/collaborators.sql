-- name: CreateCollaborator :one
INSERT INTO collaborators (
    project_id, user_id, role, status, invited_by
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: GetCollaboratorByID :one
SELECT * FROM collaborators
WHERE collaborator_id = $1
LIMIT 1;

-- name: GetProjectCollaborators :many
SELECT * FROM collaborators
WHERE project_id = $1 AND status != 'removed'
ORDER BY invited_at DESC;

-- name: GetUserCollaborations :many
SELECT * FROM collaborators
WHERE user_id = $1 AND status = 'active'
ORDER BY joined_at DESC;

-- name: UpdateCollaboratorRole :exec
UPDATE collaborators
SET role = $2
WHERE collaborator_id = $1;

-- name: UpdateCollaboratorStatus :exec
UPDATE collaborators
SET status = $2, joined_at = CASE WHEN $2 = 'active' THEN NOW() ELSE joined_at END
WHERE collaborator_id = $1;

-- name: DeleteCollaborator :exec
DELETE FROM collaborators
WHERE collaborator_id = $1;

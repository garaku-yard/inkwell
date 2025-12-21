-- name: CreateScene :one
INSERT INTO scenes (
    project_id, scene_heading, content, order_index, outline_unit_id
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: GetSceneByID :one
SELECT * FROM scenes
WHERE scene_id = $1;

-- name: GetScenesByProjectID :many
SELECT * FROM scenes
WHERE project_id = $1
ORDER BY order_index ASC;

-- name: UpdateScene :one
UPDATE scenes
SET scene_heading = $2,
    content = $3,
    order_index = $4,
    outline_unit_id = $5,
    updated_at = NOW()
WHERE scene_id = $1
RETURNING *;

-- name: DeleteScene :exec
DELETE FROM scenes
WHERE scene_id = $1;

-- name: ReorderScenes :exec
UPDATE scenes
SET order_index = $2
WHERE scene_id = $1;

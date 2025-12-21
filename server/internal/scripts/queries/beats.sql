-- name: CreateBeat :one
INSERT INTO beats (
    project_id, title, description, position_x, position_y, color, beat_order
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: GetBeatByID :one
SELECT * FROM beats
WHERE beat_id = $1;

-- name: GetBeatsByProjectID :many
SELECT * FROM beats
WHERE project_id = $1
ORDER BY beat_order ASC;

-- name: UpdateBeat :one
UPDATE beats
SET title = $2,
    description = $3,
    position_x = $4,
    position_y = $5,
    color = $6,
    beat_order = $7,
    updated_at = NOW()
WHERE beat_id = $1
RETURNING *;

-- name: MoveBeat :exec
UPDATE beats
SET position_x = $2,
    position_y = $3,
    updated_at = NOW()
WHERE beat_id = $1;

-- name: DeleteBeat :exec
DELETE FROM beats
WHERE beat_id = $1;

-- name: ReorderBeats :exec
UPDATE beats
SET beat_order = $2
WHERE beat_id = $1;

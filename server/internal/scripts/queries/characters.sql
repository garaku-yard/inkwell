-- name: CreateCharacter :one
INSERT INTO characters (
    project_id, name, description, role, attributes
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: GetCharacterByID :one
SELECT * FROM characters
WHERE character_id = $1;

-- name: GetCharactersByProjectID :many
SELECT * FROM characters
WHERE project_id = $1
ORDER BY name ASC;

-- name: UpdateCharacter :one
UPDATE characters
SET name = $2,
    description = $3,
    role = $4,
    attributes = $5,
    updated_at = NOW()
WHERE character_id = $1
RETURNING *;

-- name: DeleteCharacter :exec
DELETE FROM characters
WHERE character_id = $1;

-- name: SearchCharacters :many
SELECT * FROM characters
WHERE project_id = $1 AND (
    name ILIKE '%' || $2 || '%'
    OR description ILIKE '%' || $2 || '%'
)
ORDER BY name ASC;

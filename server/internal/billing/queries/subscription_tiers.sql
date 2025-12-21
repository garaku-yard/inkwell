-- name: CreateSubscriptionTier :one
INSERT INTO subscription_tiers (
    name, slug, description, monthly_price, yearly_price, features, limits, display_order, is_active, is_public
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
) RETURNING *;

-- name: GetSubscriptionTierByID :one
SELECT * FROM subscription_tiers
WHERE id = $1 AND deleted_at IS NULL
LIMIT 1;

-- name: GetSubscriptionTierBySlug :one
SELECT * FROM subscription_tiers
WHERE slug = $1 AND deleted_at IS NULL
LIMIT 1;

-- name: ListSubscriptionTiers :many
SELECT * FROM subscription_tiers
WHERE deleted_at IS NULL AND is_active = true
ORDER BY display_order ASC;

-- name: UpdateSubscriptionTier :one
UPDATE subscription_tiers
SET
    name = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description),
    monthly_price = COALESCE(sqlc.narg('monthly_price'), monthly_price),
    yearly_price = COALESCE(sqlc.narg('yearly_price'), yearly_price),
    features = COALESCE(sqlc.narg('features'), features),
    limits = COALESCE(sqlc.narg('limits'), limits),
    display_order = COALESCE(sqlc.narg('display_order'), display_order),
    is_active = COALESCE(sqlc.narg('is_active'), is_active),
    is_public = COALESCE(sqlc.narg('is_public'), is_public),
    updated_at = NOW()
WHERE id = sqlc.arg('id') AND deleted_at IS NULL
RETURNING *;

-- name: DeleteSubscriptionTier :exec
UPDATE subscription_tiers
SET deleted_at = NOW()
WHERE id = $1;

-- name: CountActiveSubscriptionsByTierID :one
SELECT COUNT(*) FROM user_subscriptions
WHERE tier_id = $1 AND status IN ('active', 'trialing') AND deleted_at IS NULL;

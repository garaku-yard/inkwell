-- name: CreateUserSubscription :one
INSERT INTO user_subscriptions (
    user_id, tier_id, gateway_id, external_subscription_id, external_customer_id,
    status, billing_cycle, current_period_start, current_period_end
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
) RETURNING *;

-- name: GetUserSubscriptionByUserID :one
SELECT * FROM user_subscriptions
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 1;

-- name: GetUserSubscriptionByID :one
SELECT * FROM user_subscriptions
WHERE id = $1 AND deleted_at IS NULL
LIMIT 1;

-- name: UpdateUserSubscription :one
UPDATE user_subscriptions
SET
    tier_id = COALESCE(sqlc.narg('tier_id'), tier_id),
    status = COALESCE(sqlc.narg('status'), status),
    billing_cycle = COALESCE(sqlc.narg('billing_cycle'), billing_cycle),
    current_period_start = COALESCE(sqlc.narg('current_period_start'), current_period_start),
    current_period_end = COALESCE(sqlc.narg('current_period_end'), current_period_end),
    cancel_at_period_end = COALESCE(sqlc.narg('cancel_at_period_end'), cancel_at_period_end),
    canceled_at = sqlc.narg('canceled_at'),
    updated_at = NOW()
WHERE id = sqlc.arg('id') AND deleted_at IS NULL
RETURNING *;

-- name: GetActivePaymentGateway :one
SELECT * FROM payment_gateways
WHERE active = true
LIMIT 1;

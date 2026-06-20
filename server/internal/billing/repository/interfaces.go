// Package repository defines the data-access interfaces for the Billing service.
package repository

import (
	"context"
	"database/sql"

	"github.com/google/uuid"

	"inkwell/server/internal/billing/domain"
)

// BillingRepository is the single data-access interface for the Billing service.
// All database I/O goes through this interface; the production implementation uses
// PostgreSQL and tests can supply a fake.
type BillingRepository interface {
	// ── Tiers ──────────────────────────────────────────────────────────────────

	// ListTiers returns all active, public subscription tiers ordered by display_order.
	ListTiers(ctx context.Context) ([]*domain.SubscriptionTier, error)
	// GetTierByID retrieves a single tier. Returns ErrTierNotFound when absent.
	GetTierByID(ctx context.Context, id uuid.UUID) (*domain.SubscriptionTier, error)
	// ListAllTiers returns every non-deleted tier (incl. inactive/non-public) for
	// the admin editor.
	ListAllTiers(ctx context.Context) ([]*domain.SubscriptionTier, error)
	// GetDefaultTier returns the tier applied to users with no subscription.
	GetDefaultTier(ctx context.Context) (*domain.SubscriptionTier, error)
	// CreateTier / UpdateTier / DeleteTier (soft) / ReorderTiers back the admin editor.
	CreateTier(ctx context.Context, t *domain.SubscriptionTier) error
	UpdateTier(ctx context.Context, t *domain.SubscriptionTier) error
	DeleteTier(ctx context.Context, id uuid.UUID) error
	ReorderTiers(ctx context.Context, ids []uuid.UUID) error

	// ── Gateways ───────────────────────────────────────────────────────────────

	// ListGateways returns all configured payment gateways.
	ListGateways(ctx context.Context) ([]*domain.PaymentGateway, error)
	// GetActiveGateway returns the currently active payment gateway.
	// Returns ErrGatewayNotFound when none is marked active.
	GetActiveGateway(ctx context.Context) (*domain.PaymentGateway, error)
	// GetGatewayByKey returns the gateway with the given stable key ("paddle").
	// Returns ErrGatewayNotFound when absent.
	GetGatewayByKey(ctx context.Context, gatewayID string) (*domain.PaymentGateway, error)

	// ── Subscriptions ──────────────────────────────────────────────────────────

	// CreateSubscription inserts a new subscription record outside any caller-managed
	// transaction. Prefer CreateSubscriptionTx when the write must be atomic with an
	// outbox enqueue.
	CreateSubscription(ctx context.Context, sub *domain.UserSubscription) error
	// CreateSubscriptionTx inserts a new subscription record inside the given
	// transaction. The service layer uses this alongside outbox.Store.EnqueueTx so
	// that the subscription row and the outbox event commit together.
	CreateSubscriptionTx(ctx context.Context, tx *sql.Tx, sub *domain.UserSubscription) error
	// GetSubscriptionByUserID returns the most recent subscription for a user.
	// Returns ErrSubscriptionNotFound when no record exists.
	GetSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (*domain.UserSubscription, error)
	// GetSubscriptionByID returns a subscription by its primary key.
	GetSubscriptionByID(ctx context.Context, id uuid.UUID) (*domain.UserSubscription, error)
	// GetSubscriptionByExternalID returns the subscription mirroring a given
	// gateway subscription id (e.g. Paddle sub_…). Used to make webhook handling
	// idempotent. Returns ErrSubscriptionNotFound when none exists yet.
	GetSubscriptionByExternalID(ctx context.Context, externalID string) (*domain.UserSubscription, error)
	// UpdateSubscription updates mutable fields on an existing subscription.
	UpdateSubscription(ctx context.Context, sub *domain.UserSubscription) error
	// UpdateSubscriptionTx is the transaction-scoped variant of UpdateSubscription,
	// used by the service layer to pair the update with an outbox enqueue atomically.
	UpdateSubscriptionTx(ctx context.Context, tx *sql.Tx, sub *domain.UserSubscription) error
	// ListSubscriptions returns a paginated list of all subscriptions.
	ListSubscriptions(ctx context.Context, offset, limit int, status string) ([]*domain.UserSubscription, int, error)

	// ── Usage tracking ─────────────────────────────────────────────────────────

	// TrackUsage atomically appends a usage event and upserts the aggregate total.
	// Both writes happen in a single transaction so the log and aggregate agree.
	TrackUsage(ctx context.Context, userID uuid.UUID, metric string, quantity int64) error
	// GetMonthlyUsage sums a user's usage for a metric within the current
	// calendar month (used to reseed the Redis counter on a cache miss).
	GetMonthlyUsage(ctx context.Context, userID uuid.UUID, metric string) (int64, error)
	// InsertUsageEvents appends a batch of usage events to the durable log in a
	// single multi-row insert. Used by the async usage flusher.
	InsertUsageEvents(ctx context.Context, events []domain.UsageEvent) error
	// GetUsageTotal returns the current aggregate usage for a user + metric.
	// Returns 0 with no error when no events have been recorded yet.
	GetUsageTotal(ctx context.Context, userID uuid.UUID, metric string) (int64, error)
	// ListUserUsage returns all metrics for a user (used by the admin overview and
	// by the GetUserUsage gRPC endpoint).
	ListUserUsage(ctx context.Context, userID uuid.UUID) (map[string]int64, error)

	// ── Analytics ──────────────────────────────────────────────────────────────

	// GetAnalytics computes MRR, ARR, churn rate and per-tier breakdowns from
	// the current subscription + tier data. Churn is measured over the last 30 days.
	GetAnalytics(ctx context.Context) (*domain.BillingAnalytics, error)
}

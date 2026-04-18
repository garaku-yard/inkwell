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

	// ── Gateways ───────────────────────────────────────────────────────────────

	// ListGateways returns all configured payment gateways.
	ListGateways(ctx context.Context) ([]*domain.PaymentGateway, error)
	// GetActiveGateway returns the currently active payment gateway.
	// Returns ErrGatewayNotFound when none is marked active.
	GetActiveGateway(ctx context.Context) (*domain.PaymentGateway, error)

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

// Package repository defines the data-access interfaces for the Billing service.
package repository

import (
	"context"

	"github.com/google/uuid"

	"scriptlith/server/internal/billing/domain"
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

	// CreateSubscription inserts a new subscription record.
	CreateSubscription(ctx context.Context, sub *domain.UserSubscription) error
	// GetSubscriptionByUserID returns the most recent subscription for a user.
	// Returns ErrSubscriptionNotFound when no record exists.
	GetSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (*domain.UserSubscription, error)
	// GetSubscriptionByID returns a subscription by its primary key.
	GetSubscriptionByID(ctx context.Context, id uuid.UUID) (*domain.UserSubscription, error)
	// UpdateSubscription updates mutable fields on an existing subscription.
	UpdateSubscription(ctx context.Context, sub *domain.UserSubscription) error
	// ListSubscriptions returns a paginated list of all subscriptions.
	ListSubscriptions(ctx context.Context, offset, limit int, status string) ([]*domain.UserSubscription, int, error)

	// ── Outbox ─────────────────────────────────────────────────────────────────

	// CreateOutboxEvent inserts a pending domain event into the outbox table.
	// Should be called within the same DB transaction as the triggering write.
	CreateOutboxEvent(ctx context.Context, event *domain.BillingOutboxEvent) error
	// ListUnpublishedOutboxEvents returns events not yet sent to Kafka.
	ListUnpublishedOutboxEvents(ctx context.Context, limit int) ([]*domain.BillingOutboxEvent, error)
	// MarkOutboxEventPublished stamps an event as delivered so it is not re-sent.
	MarkOutboxEventPublished(ctx context.Context, id uuid.UUID) error
}

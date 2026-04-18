// Package domain defines the core types and error sentinels for the Billing service.
package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// ─── Domain errors ────────────────────────────────────────────────────────────

var (
	// ErrTierNotFound is returned when a subscription tier does not exist.
	ErrTierNotFound = errors.New("subscription tier not found")
	// ErrGatewayNotFound is returned when a payment gateway is not configured.
	ErrGatewayNotFound = errors.New("payment gateway not found")
	// ErrSubscriptionNotFound is returned when a user has no matching subscription record.
	ErrSubscriptionNotFound = errors.New("subscription not found")
	// ErrSubscriptionAlreadyExists is returned when a user already has an active subscription.
	ErrSubscriptionAlreadyExists = errors.New("subscription already exists")
	// ErrInvalidStatus is returned when an unknown subscription status string is supplied.
	ErrInvalidStatus = errors.New("invalid subscription status")
)

// ─── Types ────────────────────────────────────────────────────────────────────

// SubscriptionTier represents a billing plan available to users.
type SubscriptionTier struct {
	ID           uuid.UUID `db:"id"`
	Name         string    `db:"name"`
	Slug         string    `db:"slug"`
	Description  string    `db:"description"`
	MonthlyPrice float64   `db:"monthly_price"`
	YearlyPrice  float64   `db:"yearly_price"`
	// Features is a free-form JSON map of feature flags.
	Features    map[string]interface{} `db:"features"`
	// Limits is a free-form JSON map of usage limits (e.g. max_projects, ai_tokens).
	Limits      map[string]interface{} `db:"limits"`
	DisplayOrder int                   `db:"display_order"`
	IsActive    bool                   `db:"is_active"`
	IsPublic    bool                   `db:"is_public"`
	CreatedAt   time.Time              `db:"created_at"`
	UpdatedAt   time.Time              `db:"updated_at"`
}

// PaymentGateway represents a configured payment provider (Stripe, Paddle, …).
type PaymentGateway struct {
	ID          uuid.UUID              `db:"id"`
	GatewayID   string                 `db:"gateway_id"` // "stripe", "paddle", "lemonsqueezy"
	Name        string                 `db:"name"`
	Description string                 `db:"description"`
	Config      map[string]interface{} `db:"config"`
	Active      bool                   `db:"active"`
	CreatedAt   time.Time              `db:"created_at"`
	UpdatedAt   time.Time              `db:"updated_at"`
}

// UserSubscription is a user's active billing subscription.
type UserSubscription struct {
	ID                     uuid.UUID  `db:"id"`
	UserID                 uuid.UUID  `db:"user_id"`
	TierID                 uuid.UUID  `db:"tier_id"`
	GatewayID              uuid.UUID  `db:"gateway_id"`
	ExternalSubscriptionID string     `db:"external_subscription_id"`
	ExternalCustomerID     string     `db:"external_customer_id"`
	Status                 string     `db:"status"` // "active", "trialing", "past_due", "canceled"
	BillingCycle           string     `db:"billing_cycle"` // "monthly", "yearly"
	CurrentPeriodStart     time.Time  `db:"current_period_start"`
	CurrentPeriodEnd       time.Time  `db:"current_period_end"`
	CancelAtPeriodEnd      bool       `db:"cancel_at_period_end"`
	CanceledAt             *time.Time `db:"canceled_at"`
	TrialStart             *time.Time `db:"trial_start"`
	TrialEnd               *time.Time `db:"trial_end"`
	CreatedAt              time.Time  `db:"created_at"`
	UpdatedAt              time.Time  `db:"updated_at"`
}

// BillingOutboxEvent is a pending domain event that must be published to Kafka.
// Written inside the same DB transaction as the subscription change; a background
// poller picks it up and emits it, then marks it published (outbox pattern).
type BillingOutboxEvent struct {
	ID          uuid.UUID  `db:"id"`
	EventType   string     `db:"event_type"`
	Payload     []byte     `db:"payload"` // JSON
	PublishedAt *time.Time `db:"published_at"`
	CreatedAt   time.Time  `db:"created_at"`
}

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
	// ErrGatewayNotConfigured is returned when a checkout or webhook is attempted
	// but no payment gateway credentials are present (the build-now-plug-later
	// state). The gateway surfaces this as "checkout not available".
	ErrGatewayNotConfigured = errors.New("payment gateway not configured")
	// ErrPriceNotConfigured is returned when a tier has no external price id mapped
	// for the active gateway, so checkout cannot name a price to charge.
	ErrPriceNotConfigured = errors.New("tier has no price configured for the payment gateway")
	// ErrInvalidBillingCycle is returned when checkout receives an unsupported cycle.
	ErrInvalidBillingCycle = errors.New("billing cycle must be monthly or yearly")
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
	// Features is the marketing bullet list shown on the pricing page (display
	// only — never enforced; the enforced caps live in Limits).
	Features []string `db:"features"`
	// Limits is the enforced usage-limit map: max_projects,
	// max_collaborators_per_project, business_workspaces (-1 = unlimited).
	Limits       map[string]int64 `db:"limits"`
	DisplayOrder int              `db:"display_order"`
	IsActive     bool             `db:"is_active"`
	IsPublic     bool             `db:"is_public"`
	// IsDefault marks the tier applied to users with no subscription.
	IsDefault bool      `db:"is_default"`
	PerSeat   bool      `db:"per_seat"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
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
	Status                 string     `db:"status"`        // "active", "trialing", "past_due", "canceled"
	BillingCycle           string     `db:"billing_cycle"` // "monthly", "yearly"
	Quantity               int        `db:"quantity"`      // seats purchased (per-seat tiers); 1 otherwise
	CurrentPeriodStart     time.Time  `db:"current_period_start"`
	CurrentPeriodEnd       time.Time  `db:"current_period_end"`
	CancelAtPeriodEnd      bool       `db:"cancel_at_period_end"`
	CanceledAt             *time.Time `db:"canceled_at"`
	TrialStart             *time.Time `db:"trial_start"`
	TrialEnd               *time.Time `db:"trial_end"`
	CreatedAt              time.Time  `db:"created_at"`
	UpdatedAt              time.Time  `db:"updated_at"`
}

// Outbox events are modelled in pkg/outbox.Event. The billing_outbox table is
// read and written via pkg/outbox.PostgresStore, keeping the schema reusable
// across services without duplicating a per-service struct here.

// BillingAnalytics aggregates billing KPIs shown on the admin dashboard.
// MRR and ARR are expressed in the same whole-dollar units as SubscriptionTier.MonthlyPrice.
type BillingAnalytics struct {
	// MRR is monthly recurring revenue: sum of monthly_price across active subscriptions.
	MRR float64
	// ARR is annual recurring revenue: MRR * 12.
	ARR float64
	// ChurnRate is the fraction of subscriptions canceled in the last 30 days over the active count (0–1).
	ChurnRate float64
	// TierDistribution is the active subscriber count per tier.
	TierDistribution []TierCount
	// RevenueByTier is the MRR contribution per tier.
	RevenueByTier []TierRevenue
}

// TierCount pairs a tier with the number of active subscribers on it.
type TierCount struct {
	TierID   uuid.UUID
	TierName string
	Count    int64
}

// TierRevenue pairs a tier with its MRR contribution.
type TierRevenue struct {
	TierID   uuid.UUID
	TierName string
	Revenue  float64
}

// UsageEvent is a single metered usage increment, persisted to usage_events.
// Used by the batched durable writer that backs the Redis usage counters.
type UsageEvent struct {
	UserID   uuid.UUID
	Metric   string
	Quantity int64
}

// UsageSnapshot bundles a user's lifetime per-metric totals with the
// current-calendar-month sums for the metrics the caller flagged as monthly.
// Returned by the batch usage path that powers the admin subscriptions table.
type UsageSnapshot struct {
	// Totals holds lifetime aggregates from user_usage_totals, keyed by metric.
	Totals map[string]int64
	// Monthly holds current-month sums for the requested monthly metrics.
	Monthly map[string]int64
}

// Package service implements the billing business logic for Inkwell.
package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"inkwell/server/internal/billing/domain"
	"inkwell/server/internal/billing/repository"
	"inkwell/server/pkg/events"
	"inkwell/server/pkg/outbox"
	"inkwell/server/pkg/paddle"
)

// BillingService defines the billing business-logic interface.
// The handler layer depends on this interface; tests can supply a fake.
type BillingService interface {
	// ListTiers returns all active public subscription tiers.
	ListTiers(ctx context.Context) ([]*domain.SubscriptionTier, error)
	// GetTierByID returns a single tier by its UUID.
	GetTierByID(ctx context.Context, id uuid.UUID) (*domain.SubscriptionTier, error)
	// ListAllTiers returns every tier (incl. inactive/non-public) for the admin editor.
	ListAllTiers(ctx context.Context) ([]*domain.SubscriptionTier, error)
	// GetDefaultTier returns the tier applied to users with no subscription.
	GetDefaultTier(ctx context.Context) (*domain.SubscriptionTier, error)
	// GetEffectiveTier returns the tier whose limits apply to a user: their
	// active subscription's tier, or the default tier otherwise.
	GetEffectiveTier(ctx context.Context, userID uuid.UUID) (*domain.SubscriptionTier, error)
	// CreateTier / UpdateTier / DeleteTier / ReorderTiers back the admin tier editor.
	CreateTier(ctx context.Context, t *domain.SubscriptionTier) (*domain.SubscriptionTier, error)
	UpdateTier(ctx context.Context, t *domain.SubscriptionTier) (*domain.SubscriptionTier, error)
	DeleteTier(ctx context.Context, id uuid.UUID) error
	ReorderTiers(ctx context.Context, ids []uuid.UUID) error

	// ListGateways returns all configured payment gateways.
	ListGateways(ctx context.Context) ([]*domain.PaymentGateway, error)
	// CreateCheckout creates a hosted checkout for a tier and seat quantity and
	// returns its URL. quantity is the number of seats for per-seat tiers (1 for
	// flat tiers). Returns ErrGatewayNotConfigured when no payment gateway is set
	// up, or ErrPriceNotConfigured when the tier has no mapped gateway price.
	CreateCheckout(ctx context.Context, userID, tierID uuid.UUID, quantity int) (string, error)
	// ProcessWebhook verifies a payment-gateway (Paddle) webhook and applies its
	// subscription event to user_subscriptions. Returns ErrGatewayNotConfigured
	// when the gateway is disabled, or a signature error on a bad payload.
	ProcessWebhook(ctx context.Context, signature string, payload []byte) error

	// GetUserSubscription returns the active subscription for a user.
	GetUserSubscription(ctx context.Context, userID uuid.UUID) (*domain.UserSubscription, error)
	// CreateSubscription creates a new subscription and publishes billing.updated.
	CreateSubscription(ctx context.Context, sub *domain.UserSubscription) error
	// UpdateSubscription updates a subscription and publishes billing.updated.
	UpdateSubscription(ctx context.Context, sub *domain.UserSubscription) error
	// CancelSubscription marks a subscription to cancel at period end.
	CancelSubscription(ctx context.Context, subscriptionID uuid.UUID) error

	// ListSubscriptions returns a paginated list of all subscriptions (admin).
	ListSubscriptions(ctx context.Context, offset, limit int, status string) ([]*domain.UserSubscription, int, error)

	// TrackUsage records a usage increment for a user. Called by other services
	// (e.g. scripts) via the billing gRPC client whenever a tracked action succeeds.
	TrackUsage(ctx context.Context, userID uuid.UUID, metric string, quantity int64) error
	// GetUserUsage returns the aggregate usage totals for a user, keyed by metric.
	GetUserUsage(ctx context.Context, userID uuid.UUID) (map[string]int64, error)

	// GetAnalytics returns admin-facing KPIs (MRR, ARR, churn, tier distribution).
	GetAnalytics(ctx context.Context) (*domain.BillingAnalytics, error)
	// ListAllSubscriptions returns every subscription with optional status filter
	// and pagination for the admin subscriptions table.
	ListAllSubscriptions(ctx context.Context, offset, limit int, statusFilter string) ([]*domain.UserSubscription, int, error)
}

// CheckoutCreator creates a hosted checkout for a price and seat quantity and
// returns its URL. *paddle.Client satisfies it; a nil value means no payment
// gateway is configured.
type CheckoutCreator interface {
	CreateCheckout(ctx context.Context, priceID string, quantity int, customData map[string]string) (string, error)
}

// PaymentConfig wires the payment gateway into the billing service. The whole
// feature is inert until it is populated: Checkout nil disables checkout and
// WebhookSecret empty disables webhook processing (build-now-plug-later).
// PriceMap maps a tier slug to its gateway price id.
type PaymentConfig struct {
	Checkout      CheckoutCreator
	WebhookSecret string
	PriceMap      map[string]string
}

type billingService struct {
	db        *sql.DB
	repo      repository.BillingRepository
	outbox    outbox.Store
	publisher events.Publisher
	payment   PaymentConfig
}

// NewBillingService creates a BillingService.
//
// The service pairs every subscription mutation with an outbox enqueue inside a
// single database transaction; db is used to open transactions and outbox is the
// event store (typically outbox.NewPostgresStore(db, "billing_outbox")).
// publisher is retained for fire-and-forget best-effort emission alongside the
// durable outbox write; the background poller in cmd/billing handles reliability.
// payment carries the Paddle integration, left zero-valued to run without a
// payment gateway. In tests, pass &events.NoopPublisher{} and an in-memory Store.
func NewBillingService(db *sql.DB, repo repository.BillingRepository, outbox outbox.Store, publisher events.Publisher, payment PaymentConfig) BillingService {
	return &billingService{db: db, repo: repo, outbox: outbox, publisher: publisher, payment: payment}
}

func (s *billingService) ListTiers(ctx context.Context) ([]*domain.SubscriptionTier, error) {
	return s.repo.ListTiers(ctx)
}

func (s *billingService) GetTierByID(ctx context.Context, id uuid.UUID) (*domain.SubscriptionTier, error) {
	return s.repo.GetTierByID(ctx, id)
}

func (s *billingService) ListAllTiers(ctx context.Context) ([]*domain.SubscriptionTier, error) {
	return s.repo.ListAllTiers(ctx)
}

func (s *billingService) GetDefaultTier(ctx context.Context) (*domain.SubscriptionTier, error) {
	return s.repo.GetDefaultTier(ctx)
}

// GetEffectiveTier returns the tier whose limits govern a user: their active or
// trialing subscription's tier, or the default tier when there's no usable
// subscription (the paywall's "free by default").
func (s *billingService) GetEffectiveTier(ctx context.Context, userID uuid.UUID) (*domain.SubscriptionTier, error) {
	sub, err := s.repo.GetSubscriptionByUserID(ctx, userID)
	if err == nil && sub != nil && (sub.Status == "active" || sub.Status == "trialing") {
		if tier, terr := s.repo.GetTierByID(ctx, sub.TierID); terr == nil {
			return tier, nil
		}
	}
	return s.repo.GetDefaultTier(ctx)
}

func (s *billingService) CreateTier(ctx context.Context, t *domain.SubscriptionTier) (*domain.SubscriptionTier, error) {
	t.ID = uuid.New()
	if t.Slug == "" {
		t.Slug = slugify(t.Name)
	}
	if err := s.repo.CreateTier(ctx, t); err != nil {
		return nil, err
	}
	return s.repo.GetTierByID(ctx, t.ID)
}

func (s *billingService) UpdateTier(ctx context.Context, t *domain.SubscriptionTier) (*domain.SubscriptionTier, error) {
	if err := s.repo.UpdateTier(ctx, t); err != nil {
		return nil, err
	}
	return s.repo.GetTierByID(ctx, t.ID)
}

func (s *billingService) DeleteTier(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteTier(ctx, id)
}

func (s *billingService) ReorderTiers(ctx context.Context, ids []uuid.UUID) error {
	return s.repo.ReorderTiers(ctx, ids)
}

// slugify turns a tier name into a URL-safe slug (lowercase, dashes).
func slugify(name string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			prevDash = false
		case !prevDash:
			b.WriteRune('-')
			prevDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func (s *billingService) ListGateways(ctx context.Context) ([]*domain.PaymentGateway, error) {
	return s.repo.ListGateways(ctx)
}

// CreateCheckout resolves the tier's gateway price and asks the payment gateway
// for a hosted checkout link, stamping the user and tier into custom data so the
// resulting subscription webhook can be attributed back to them.
func (s *billingService) CreateCheckout(ctx context.Context, userID, tierID uuid.UUID, quantity int) (string, error) {
	if s.payment.Checkout == nil {
		return "", domain.ErrGatewayNotConfigured
	}
	tier, err := s.repo.GetTierByID(ctx, tierID)
	if err != nil {
		return "", err
	}
	priceID := s.payment.PriceMap[tier.Slug]
	if priceID == "" {
		return "", domain.ErrPriceNotConfigured
	}
	// Only per-seat tiers honour a seat quantity; flat tiers are always 1 seat.
	if !tier.PerSeat || quantity < 1 {
		quantity = 1
	}
	return s.payment.Checkout.CreateCheckout(ctx, priceID, quantity, map[string]string{
		"user_id": userID.String(),
		"tier_id": tierID.String(),
	})
}

// ProcessWebhook verifies a Paddle webhook signature, parses it, and mirrors any
// subscription change into user_subscriptions. Non-subscription events and events
// without a signature verify-then-ignore. It is idempotent: Paddle may resend the
// same event, so writes key on the external subscription id.
func (s *billingService) ProcessWebhook(ctx context.Context, signature string, payload []byte) error {
	if s.payment.WebhookSecret == "" {
		return domain.ErrGatewayNotConfigured
	}
	if err := paddle.VerifySignature(s.payment.WebhookSecret, signature, payload, time.Now(), paddle.DefaultTolerance); err != nil {
		return err
	}
	evt, err := paddle.ParseEvent(payload)
	if err != nil {
		return err
	}
	if evt.Subscription == nil {
		return nil // non-subscription event — verified, nothing to mirror
	}
	return s.applySubscriptionEvent(ctx, evt.Subscription)
}

// applySubscriptionEvent upserts a Paddle subscription into user_subscriptions,
// attributing it via the user_id/tier_id stamped in custom data at checkout.
func (s *billingService) applySubscriptionEvent(ctx context.Context, sub *paddle.Subscription) error {
	userID, err := uuid.Parse(sub.UserID)
	if err != nil {
		return fmt.Errorf("webhook: missing/invalid custom_data.user_id: %w", err)
	}
	tierID, err := uuid.Parse(sub.TierID)
	if err != nil {
		return fmt.Errorf("webhook: missing/invalid custom_data.tier_id: %w", err)
	}
	gw, err := s.repo.GetGatewayByKey(ctx, "paddle")
	if err != nil {
		return err
	}
	status := mapPaddleStatus(sub.Status)

	existing, err := s.repo.GetSubscriptionByExternalID(ctx, sub.ID)
	if err != nil && !errors.Is(err, domain.ErrSubscriptionNotFound) {
		return err
	}
	if existing != nil {
		existing.TierID = tierID
		existing.Status = status
		existing.Quantity = sub.Quantity
		existing.CurrentPeriodStart = sub.CurrentPeriodStart
		existing.CurrentPeriodEnd = sub.CurrentPeriodEnd
		existing.CanceledAt = sub.CanceledAt
		existing.CancelAtPeriodEnd = sub.CanceledAt != nil
		return s.UpdateSubscription(ctx, existing)
	}

	return s.CreateSubscription(ctx, &domain.UserSubscription{
		UserID:                 userID,
		TierID:                 tierID,
		GatewayID:              gw.ID,
		ExternalSubscriptionID: sub.ID,
		ExternalCustomerID:     sub.CustomerID,
		Status:                 status,
		BillingCycle:           "monthly",
		Quantity:               sub.Quantity,
		CurrentPeriodStart:     sub.CurrentPeriodStart,
		CurrentPeriodEnd:       sub.CurrentPeriodEnd,
		CancelAtPeriodEnd:      sub.CanceledAt != nil,
		CanceledAt:             sub.CanceledAt,
	})
}

// mapPaddleStatus maps a Paddle subscription status to the user_subscriptions
// status vocabulary. Paddle's "paused" has no direct equivalent; it maps to
// past_due (access suspended but the row survives), as does anything unexpected.
func mapPaddleStatus(paddleStatus string) string {
	switch paddleStatus {
	case "active", "trialing", "past_due", "canceled":
		return paddleStatus
	default:
		return "past_due"
	}
}

func (s *billingService) GetUserSubscription(ctx context.Context, userID uuid.UUID) (*domain.UserSubscription, error) {
	return s.repo.GetSubscriptionByUserID(ctx, userID)
}

func (s *billingService) CreateSubscription(ctx context.Context, sub *domain.UserSubscription) error {
	sub.ID = uuid.New()
	sub.CreatedAt = time.Now()
	sub.UpdatedAt = time.Now()

	if err := s.commitWithOutbox(ctx, sub, "created", func(tx *sql.Tx) error {
		return s.repo.CreateSubscriptionTx(ctx, tx, sub)
	}); err != nil {
		return err
	}

	s.publishBillingEvent(ctx, sub, "created")
	return nil
}

func (s *billingService) UpdateSubscription(ctx context.Context, sub *domain.UserSubscription) error {
	sub.UpdatedAt = time.Now()

	if err := s.commitWithOutbox(ctx, sub, "updated", func(tx *sql.Tx) error {
		return s.repo.UpdateSubscriptionTx(ctx, tx, sub)
	}); err != nil {
		return err
	}

	s.publishBillingEvent(ctx, sub, "updated")
	return nil
}

func (s *billingService) CancelSubscription(ctx context.Context, subscriptionID uuid.UUID) error {
	sub, err := s.repo.GetSubscriptionByID(ctx, subscriptionID)
	if err != nil {
		return err
	}
	now := time.Now()
	sub.CancelAtPeriodEnd = true
	sub.CanceledAt = &now

	if err := s.commitWithOutbox(ctx, sub, "canceled", func(tx *sql.Tx) error {
		return s.repo.UpdateSubscriptionTx(ctx, tx, sub)
	}); err != nil {
		return err
	}

	s.publishBillingEvent(ctx, sub, "canceled")
	return nil
}

// TrackUsage records a usage increment against the user's running totals.
// The write is atomic at the repository layer — the event log and aggregate
// table update together — so downstream quota reads are always consistent.
func (s *billingService) TrackUsage(ctx context.Context, userID uuid.UUID, metric string, quantity int64) error {
	return s.repo.TrackUsage(ctx, userID, metric, quantity)
}

// GetUserUsage returns a map of metric-name → aggregate total for the user.
func (s *billingService) GetUserUsage(ctx context.Context, userID uuid.UUID) (map[string]int64, error) {
	return s.repo.ListUserUsage(ctx, userID)
}

// GetAnalytics computes the admin KPIs from the current subscription + tier state.
func (s *billingService) GetAnalytics(ctx context.Context) (*domain.BillingAnalytics, error) {
	return s.repo.GetAnalytics(ctx)
}

// ListAllSubscriptions delegates to the repository.
func (s *billingService) ListAllSubscriptions(ctx context.Context, offset, limit int, statusFilter string) ([]*domain.UserSubscription, int, error) {
	return s.repo.ListSubscriptions(ctx, offset, limit, statusFilter)
}

// commitWithOutbox runs the given mutation and an outbox enqueue inside one
// transaction. Either both commit or neither does, guaranteeing that every
// subscription change has a matching durable event for the poller to deliver.
func (s *billingService) commitWithOutbox(ctx context.Context, sub *domain.UserSubscription, action string, mutate func(tx *sql.Tx) error) error {
	payload, err := json.Marshal(map[string]string{
		"subscription_id": sub.ID.String(),
		"user_id":         sub.UserID.String(),
		"status":          sub.Status,
		"action":          action,
	})
	if err != nil {
		return err
	}

	return outbox.RunInTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := mutate(tx); err != nil {
			return err
		}
		return s.outbox.EnqueueTx(ctx, tx, outbox.Event{
			Type:    events.EventTypeBillingUpdated,
			Payload: payload,
		})
	})
}

func (s *billingService) ListSubscriptions(ctx context.Context, offset, limit int, status string) ([]*domain.UserSubscription, int, error) {
	return s.repo.ListSubscriptions(ctx, offset, limit, status)
}

// publishBillingEvent emits a billing.updated Kafka event. Errors are logged but
// not returned — the outbox poller handles reliability for critical events.
func (s *billingService) publishBillingEvent(ctx context.Context, sub *domain.UserSubscription, action string) {
	payload := map[string]string{
		"subscription_id": sub.ID.String(),
		"user_id":         sub.UserID.String(),
		"status":          sub.Status,
		"action":          action,
	}
	if err := s.publisher.Publish(ctx, events.EventTypeBillingUpdated, payload); err != nil {
		slog.Warn("failed to publish billing event", "error", err, "action", action)
	}
}

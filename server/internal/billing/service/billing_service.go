// Package service implements the billing business logic for Inkwell.
package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"inkwell/server/internal/billing/domain"
	"inkwell/server/internal/billing/repository"
	"inkwell/server/pkg/events"
	"inkwell/server/pkg/outbox"
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
	// CreateTier / UpdateTier / DeleteTier / ReorderTiers back the admin tier editor.
	CreateTier(ctx context.Context, t *domain.SubscriptionTier) (*domain.SubscriptionTier, error)
	UpdateTier(ctx context.Context, t *domain.SubscriptionTier) (*domain.SubscriptionTier, error)
	DeleteTier(ctx context.Context, id uuid.UUID) error
	ReorderTiers(ctx context.Context, ids []uuid.UUID) error

	// ListGateways returns all configured payment gateways.
	ListGateways(ctx context.Context) ([]*domain.PaymentGateway, error)

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

type billingService struct {
	db        *sql.DB
	repo      repository.BillingRepository
	outbox    outbox.Store
	publisher events.Publisher
}

// NewBillingService creates a BillingService.
//
// The service pairs every subscription mutation with an outbox enqueue inside a
// single database transaction; db is used to open transactions and outbox is the
// event store (typically outbox.NewPostgresStore(db, "billing_outbox")).
// publisher is retained for fire-and-forget best-effort emission alongside the
// durable outbox write; the background poller in cmd/billing handles reliability.
// In tests, pass &events.NoopPublisher{} and an in-memory Store.
func NewBillingService(db *sql.DB, repo repository.BillingRepository, outbox outbox.Store, publisher events.Publisher) BillingService {
	return &billingService{db: db, repo: repo, outbox: outbox, publisher: publisher}
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

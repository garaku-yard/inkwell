// Package service implements the billing business logic for Scriptlith.
package service

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"scriptlith/server/internal/billing/domain"
	"scriptlith/server/internal/billing/repository"
	"scriptlith/server/pkg/events"
)

// BillingService defines the billing business-logic interface.
// The handler layer depends on this interface; tests can supply a fake.
type BillingService interface {
	// ListTiers returns all active public subscription tiers.
	ListTiers(ctx context.Context) ([]*domain.SubscriptionTier, error)
	// GetTierByID returns a single tier by its UUID.
	GetTierByID(ctx context.Context, id uuid.UUID) (*domain.SubscriptionTier, error)

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
}

type billingService struct {
	repo      repository.BillingRepository
	publisher events.Publisher
}

// NewBillingService creates a BillingService.
// publisher receives domain events; pass &events.NoopPublisher{} in tests.
func NewBillingService(repo repository.BillingRepository, publisher events.Publisher) BillingService {
	return &billingService{repo: repo, publisher: publisher}
}

func (s *billingService) ListTiers(ctx context.Context) ([]*domain.SubscriptionTier, error) {
	return s.repo.ListTiers(ctx)
}

func (s *billingService) GetTierByID(ctx context.Context, id uuid.UUID) (*domain.SubscriptionTier, error) {
	return s.repo.GetTierByID(ctx, id)
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

	if err := s.repo.CreateSubscription(ctx, sub); err != nil {
		return err
	}

	s.publishBillingEvent(ctx, sub, "created")
	return nil
}

func (s *billingService) UpdateSubscription(ctx context.Context, sub *domain.UserSubscription) error {
	sub.UpdatedAt = time.Now()
	if err := s.repo.UpdateSubscription(ctx, sub); err != nil {
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
	if err := s.repo.UpdateSubscription(ctx, sub); err != nil {
		return err
	}

	// Write outbox event atomically — even if Kafka publish fails the event is
	// persisted and the background poller will retry.
	payload, _ := json.Marshal(map[string]string{
		"subscription_id": sub.ID.String(),
		"user_id":         sub.UserID.String(),
		"action":          "canceled",
	})
	outboxEvent := &domain.BillingOutboxEvent{
		ID:        uuid.New(),
		EventType: events.EventTypeBillingUpdated,
		Payload:   payload,
		CreatedAt: time.Now(),
	}
	if err := s.repo.CreateOutboxEvent(ctx, outboxEvent); err != nil {
		slog.Warn("failed to write billing outbox event", "error", err)
	}

	s.publishBillingEvent(ctx, sub, "canceled")
	return nil
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

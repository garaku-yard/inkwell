// Package service implements the billing business logic for Inkwell.
package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"inkwell/server/internal/billing/domain"
	"inkwell/server/internal/billing/repository"
	"inkwell/server/pkg/events"
	"inkwell/server/pkg/outbox"
	"inkwell/server/pkg/paddle"
	redisclient "inkwell/server/pkg/redis"
)

// monthlyMetrics are usage metrics enforced over a calendar-month window. They
// are counted in Redis (hot path) and persisted to usage_events asynchronously;
// all other metrics use the synchronous cumulative DB path.
var monthlyMetrics = map[string]bool{"ai_tokens": true}

// usageKeyTTL keeps a monthly counter alive comfortably past its month so a
// late reseed or a slow billing read still finds it; old months expire on their own.
const usageKeyTTL = 45 * 24 * time.Hour

// monthlyUsageKey is the Redis key holding a user's running total for a metric in
// a given month, e.g. "usage:<uuid>:ai_tokens:202606".
func monthlyUsageKey(userID uuid.UUID, metric string, now time.Time) string {
	return fmt.Sprintf("usage:%s:%s:%s", userID, metric, now.Format("200601"))
}

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
	// SyncSeats updates a per-seat subscriber's seat quantity to match actual
	// usage, pushing the new quantity to the payment gateway when configured. A
	// no-op when the user has no active subscription or the count is unchanged.
	SyncSeats(ctx context.Context, userID uuid.UUID, seats int) error

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
	// GetMonthlyUsage returns a user's usage for a metric in the current calendar
	// month, for managed-AI allowance enforcement.
	GetMonthlyUsage(ctx context.Context, userID uuid.UUID, metric string) (int64, error)
	// GetBatchUsage returns lifetime totals plus current-month sums (for the given
	// monthly metrics) for many users in one pass, keyed by user id. Backs the
	// admin subscriptions table without a per-row usage fan-out.
	GetBatchUsage(ctx context.Context, userIDs []uuid.UUID, monthlyMetrics []string) (map[uuid.UUID]domain.UsageSnapshot, error)
	// RunUsageFlusher batch-persists buffered usage events until ctx is done. Run
	// once in a background goroutine; a no-op when Redis is not configured.
	RunUsageFlusher(ctx context.Context)

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

// SubscriptionUpdater changes the seat quantity on an existing gateway
// subscription. *paddle.Client satisfies it; nil disables seat auto-sync.
type SubscriptionUpdater interface {
	UpdateSubscriptionQuantity(ctx context.Context, subscriptionID, priceID string, quantity int) error
}

// PaymentConfig wires the payment gateway into the billing service. The whole
// feature is inert until it is populated: Checkout nil disables checkout,
// Updater nil disables seat auto-sync, and WebhookSecret empty disables webhook
// processing (build-now-plug-later). PriceMap maps a tier slug to its gateway
// price id.
type PaymentConfig struct {
	Checkout      CheckoutCreator
	Updater       SubscriptionUpdater
	WebhookSecret string
	PriceMap      map[string]string
}

type billingService struct {
	db        *sql.DB
	repo      repository.BillingRepository
	outbox    outbox.Store
	publisher events.Publisher
	payment   PaymentConfig
	// redis backs the live monthly usage counters; nil falls back to summing
	// usage_events directly (correct, heavier). usageCh buffers durable usage
	// writes for the async flusher and is non-nil only when redis is set.
	redis   *redisclient.Client
	usageCh chan domain.UsageEvent
}

// NewBillingService creates a BillingService.
//
// The service pairs every subscription mutation with an outbox enqueue inside a
// single database transaction; db is used to open transactions and outbox is the
// event store (typically outbox.NewPostgresStore(db, "billing_outbox")).
// publisher is retained for fire-and-forget best-effort emission alongside the
// durable outbox write; the background poller in cmd/billing handles reliability.
// payment carries the Paddle integration, left zero-valued to run without a
// payment gateway. rdb backs the live monthly usage counters; pass nil to run
// without Redis (usage falls back to direct DB sums). In tests, pass
// &events.NoopPublisher{}, an in-memory Store, and a nil rdb.
func NewBillingService(db *sql.DB, repo repository.BillingRepository, outbox outbox.Store, publisher events.Publisher, payment PaymentConfig, rdb *redisclient.Client) BillingService {
	s := &billingService{db: db, repo: repo, outbox: outbox, publisher: publisher, payment: payment, redis: rdb}
	if rdb != nil {
		s.usageCh = make(chan domain.UsageEvent, 4096)
	}
	return s
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

// SyncSeats reconciles a user's per-seat subscription quantity with their actual
// seat usage. It no-ops when the user has no active subscription (nothing to
// bill) or the quantity is already correct. When a payment gateway is configured
// and the subscription has an external id, the new quantity is pushed to the
// gateway (which prorates the charge) before the local quantity is updated; if
// the gateway rejects it, the local quantity is left unchanged so the two stay
// consistent.
func (s *billingService) SyncSeats(ctx context.Context, userID uuid.UUID, seats int) error {
	if seats < 1 {
		seats = 1
	}
	sub, err := s.repo.GetSubscriptionByUserID(ctx, userID)
	if errors.Is(err, domain.ErrSubscriptionNotFound) {
		return nil // not a paying customer — nothing to sync
	}
	if err != nil {
		return err
	}
	if sub.Status != "active" && sub.Status != "trialing" {
		return nil // only live subscriptions are billed
	}
	if sub.Quantity == seats {
		return nil // already in sync
	}

	if s.payment.Updater != nil && sub.ExternalSubscriptionID != "" {
		tier, err := s.repo.GetTierByID(ctx, sub.TierID)
		if err != nil {
			return err
		}
		if priceID := s.payment.PriceMap[tier.Slug]; priceID != "" {
			if err := s.payment.Updater.UpdateSubscriptionQuantity(ctx, sub.ExternalSubscriptionID, priceID, seats); err != nil {
				return err // gateway rejected — keep local unchanged
			}
		}
	}

	sub.Quantity = seats
	return s.UpdateSubscription(ctx, sub)
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

// TrackUsage records a usage increment. Monthly metrics (e.g. ai_tokens) bump a
// Redis counter on the hot path and persist to usage_events asynchronously via
// the flusher; everything else uses the synchronous cumulative DB write so
// project-style quotas stay read-after-write consistent.
func (s *billingService) TrackUsage(ctx context.Context, userID uuid.UUID, metric string, quantity int64) error {
	if s.redis == nil || !monthlyMetrics[metric] {
		return s.repo.TrackUsage(ctx, userID, metric, quantity)
	}

	key := monthlyUsageKey(userID, metric, time.Now())
	if _, err := s.redis.IncrBy(ctx, key, quantity, usageKeyTTL); err != nil {
		// Redis is the authoritative counter; if it's down, don't lose the
		// increment — fall back to the durable+summed DB path for this call.
		return s.repo.TrackUsage(ctx, userID, metric, quantity)
	}

	// Persist the durable audit row off the hot path. If the buffer is full,
	// write it synchronously rather than drop it (keeps the DB sum a correct
	// reseed source after a Redis eviction).
	ev := domain.UsageEvent{UserID: userID, Metric: metric, Quantity: quantity}
	select {
	case s.usageCh <- ev:
	default:
		_ = s.repo.InsertUsageEvents(ctx, []domain.UsageEvent{ev})
	}
	return nil
}

// GetMonthlyUsage returns a user's current-calendar-month usage for a metric.
// For monthly metrics it reads the Redis counter, reseeding it from usage_events
// on a cache miss so it self-heals after a Redis restart.
func (s *billingService) GetMonthlyUsage(ctx context.Context, userID uuid.UUID, metric string) (int64, error) {
	if s.redis == nil || !monthlyMetrics[metric] {
		return s.repo.GetMonthlyUsage(ctx, userID, metric)
	}

	key := monthlyUsageKey(userID, metric, time.Now())
	if val, found, err := s.redis.Get(ctx, key); err == nil && found {
		if n, perr := strconv.ParseInt(val, 10, 64); perr == nil {
			return n, nil
		}
	}
	// Miss (or Redis down): sum the durable log and reseed the counter.
	sum, err := s.repo.GetMonthlyUsage(ctx, userID, metric)
	if err != nil {
		return 0, err
	}
	_ = s.redis.Set(ctx, key, strconv.FormatInt(sum, 10), usageKeyTTL)
	return sum, nil
}

// RunUsageFlusher drains buffered usage events and batch-inserts them into
// usage_events, taking durable writes off the request path. It returns when ctx
// is cancelled, flushing whatever remains. No-op when Redis (and thus the buffer)
// is not configured.
func (s *billingService) RunUsageFlusher(ctx context.Context) {
	if s.usageCh == nil {
		return
	}
	const maxBatch = 256
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	batch := make([]domain.UsageEvent, 0, maxBatch)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		fctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := s.repo.InsertUsageEvents(fctx, batch); err != nil {
			slog.Warn("usage flush failed", "count", len(batch), "error", err)
		}
		cancel()
		batch = batch[:0]
	}

	for {
		select {
		case <-ctx.Done():
			flush()
			return
		case ev := <-s.usageCh:
			batch = append(batch, ev)
			if len(batch) >= maxBatch {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

// GetUserUsage returns a map of metric-name → aggregate total for the user.
func (s *billingService) GetUserUsage(ctx context.Context, userID uuid.UUID) (map[string]int64, error) {
	return s.repo.ListUserUsage(ctx, userID)
}

// GetBatchUsage returns lifetime totals plus current-month sums for many users
// in two batched queries (one for totals, one for monthly), avoiding the N×RTT
// fan-out of calling GetUserUsage / GetMonthlyUsage per user. For monthly
// metrics, the Redis counter is authoritative when present — it's overlaid onto
// the DB sum exactly as the per-user GetMonthlyUsage path does, so the admin
// view and the enforcement path never disagree.
func (s *billingService) GetBatchUsage(ctx context.Context, userIDs []uuid.UUID, requestedMonthly []string) (map[uuid.UUID]domain.UsageSnapshot, error) {
	out := map[uuid.UUID]domain.UsageSnapshot{}
	if len(userIDs) == 0 {
		return out, nil
	}

	totals, err := s.repo.ListUsageTotalsBatch(ctx, userIDs)
	if err != nil {
		return nil, err
	}

	// Only metrics actually tracked monthly need the usage_events sum; the rest
	// would just return zero and waste a scan.
	wantMonthly := make([]string, 0, len(requestedMonthly))
	for _, m := range requestedMonthly {
		if monthlyMetrics[m] {
			wantMonthly = append(wantMonthly, m)
		}
	}

	var monthly map[uuid.UUID]map[string]int64
	if len(wantMonthly) > 0 {
		if monthly, err = s.repo.GetMonthlyUsageBatch(ctx, userIDs, wantMonthly); err != nil {
			return nil, err
		}
	}

	now := time.Now()
	for _, uid := range userIDs {
		snap := domain.UsageSnapshot{
			Totals:  totals[uid],
			Monthly: map[string]int64{},
		}
		if snap.Totals == nil {
			snap.Totals = map[string]int64{}
		}
		for _, m := range wantMonthly {
			snap.Monthly[m] = monthly[uid][m]
			// Redis is the authoritative monthly counter; overlay it when present.
			if s.redis != nil {
				if val, found, gerr := s.redis.Get(ctx, monthlyUsageKey(uid, m, now)); gerr == nil && found {
					if n, perr := strconv.ParseInt(val, 10, 64); perr == nil {
						snap.Monthly[m] = n
					}
				}
			}
		}
		out[uid] = snap
	}
	return out, nil
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

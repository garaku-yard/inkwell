package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"scriptlith/server/internal/billing/domain"
)

type postgresRepository struct {
	db *sql.DB
}

// NewPostgresRepository returns a BillingRepository backed by PostgreSQL.
func NewPostgresRepository(db *sql.DB) BillingRepository {
	return &postgresRepository{db: db}
}

// ─── Tiers ────────────────────────────────────────────────────────────────────

func (r *postgresRepository) ListTiers(ctx context.Context) ([]*domain.SubscriptionTier, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, slug, description, monthly_price, yearly_price,
		       features, limits, display_order, is_active, is_public, created_at, updated_at
		FROM subscription_tiers
		WHERE deleted_at IS NULL AND is_active = true AND is_public = true
		ORDER BY display_order ASC`)
	if err != nil {
		return nil, fmt.Errorf("list tiers: %w", err)
	}
	defer rows.Close()

	var tiers []*domain.SubscriptionTier
	for rows.Next() {
		t, err := scanTier(rows)
		if err != nil {
			return nil, err
		}
		tiers = append(tiers, t)
	}
	return tiers, rows.Err()
}

func (r *postgresRepository) GetTierByID(ctx context.Context, id uuid.UUID) (*domain.SubscriptionTier, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, name, slug, description, monthly_price, yearly_price,
		       features, limits, display_order, is_active, is_public, created_at, updated_at
		FROM subscription_tiers
		WHERE id = $1 AND deleted_at IS NULL`, id)
	t, err := scanTier(row)
	if err == sql.ErrNoRows {
		return nil, domain.ErrTierNotFound
	}
	return t, err
}

// ─── Gateways ─────────────────────────────────────────────────────────────────

func (r *postgresRepository) ListGateways(ctx context.Context) ([]*domain.PaymentGateway, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, gateway_id, name, description, config, active, created_at, updated_at
		FROM payment_gateways ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list gateways: %w", err)
	}
	defer rows.Close()

	var gws []*domain.PaymentGateway
	for rows.Next() {
		gw, err := scanGateway(rows)
		if err != nil {
			return nil, err
		}
		gws = append(gws, gw)
	}
	return gws, rows.Err()
}

func (r *postgresRepository) GetActiveGateway(ctx context.Context) (*domain.PaymentGateway, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, gateway_id, name, description, config, active, created_at, updated_at
		FROM payment_gateways WHERE active = true LIMIT 1`)
	gw, err := scanGateway(row)
	if err == sql.ErrNoRows {
		return nil, domain.ErrGatewayNotFound
	}
	return gw, err
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

func (r *postgresRepository) CreateSubscription(ctx context.Context, sub *domain.UserSubscription) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO user_subscriptions
		  (id, user_id, tier_id, gateway_id, external_subscription_id, external_customer_id,
		   status, billing_cycle, current_period_start, current_period_end,
		   cancel_at_period_end, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		sub.ID, sub.UserID, sub.TierID, sub.GatewayID,
		sub.ExternalSubscriptionID, sub.ExternalCustomerID,
		sub.Status, sub.BillingCycle,
		sub.CurrentPeriodStart, sub.CurrentPeriodEnd,
		sub.CancelAtPeriodEnd, sub.CreatedAt, sub.UpdatedAt,
	)
	return err
}

func (r *postgresRepository) GetSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (*domain.UserSubscription, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, user_id, tier_id, gateway_id, external_subscription_id, external_customer_id,
		       status, billing_cycle, current_period_start, current_period_end,
		       cancel_at_period_end, canceled_at, trial_start, trial_end, created_at, updated_at
		FROM user_subscriptions
		WHERE user_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC LIMIT 1`, userID)
	sub, err := scanSubscription(row)
	if err == sql.ErrNoRows {
		return nil, domain.ErrSubscriptionNotFound
	}
	return sub, err
}

func (r *postgresRepository) GetSubscriptionByID(ctx context.Context, id uuid.UUID) (*domain.UserSubscription, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, user_id, tier_id, gateway_id, external_subscription_id, external_customer_id,
		       status, billing_cycle, current_period_start, current_period_end,
		       cancel_at_period_end, canceled_at, trial_start, trial_end, created_at, updated_at
		FROM user_subscriptions WHERE id = $1 AND deleted_at IS NULL`, id)
	sub, err := scanSubscription(row)
	if err == sql.ErrNoRows {
		return nil, domain.ErrSubscriptionNotFound
	}
	return sub, err
}

func (r *postgresRepository) UpdateSubscription(ctx context.Context, sub *domain.UserSubscription) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE user_subscriptions SET
		  status = $1, billing_cycle = $2, current_period_start = $3,
		  current_period_end = $4, cancel_at_period_end = $5,
		  canceled_at = $6, updated_at = $7
		WHERE id = $8`,
		sub.Status, sub.BillingCycle, sub.CurrentPeriodStart,
		sub.CurrentPeriodEnd, sub.CancelAtPeriodEnd,
		sub.CanceledAt, time.Now(), sub.ID,
	)
	return err
}

func (r *postgresRepository) ListSubscriptions(ctx context.Context, offset, limit int, statusFilter string) ([]*domain.UserSubscription, int, error) {
	query := `
		SELECT id, user_id, tier_id, gateway_id, external_subscription_id, external_customer_id,
		       status, billing_cycle, current_period_start, current_period_end,
		       cancel_at_period_end, canceled_at, trial_start, trial_end, created_at, updated_at
		FROM user_subscriptions WHERE deleted_at IS NULL`
	countQuery := `SELECT COUNT(*) FROM user_subscriptions WHERE deleted_at IS NULL`

	args := []interface{}{}
	countArgs := []interface{}{}

	if statusFilter != "" {
		query += " AND status = $1"
		countQuery += " AND status = $1"
		args = append(args, statusFilter)
		countArgs = append(countArgs, statusFilter)
		query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", 2, 3)
		args = append(args, limit, offset)
	} else {
		query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", 1, 2)
		args = append(args, limit, offset)
	}

	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, countArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var subs []*domain.UserSubscription
	for rows.Next() {
		sub, err := scanSubscription(rows)
		if err != nil {
			return nil, 0, err
		}
		subs = append(subs, sub)
	}
	return subs, total, rows.Err()
}

// ─── Outbox ───────────────────────────────────────────────────────────────────

func (r *postgresRepository) CreateOutboxEvent(ctx context.Context, event *domain.BillingOutboxEvent) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO billing_outbox (id, event_type, payload, created_at)
		VALUES ($1, $2, $3, $4)`,
		event.ID, event.EventType, event.Payload, event.CreatedAt,
	)
	return err
}

func (r *postgresRepository) ListUnpublishedOutboxEvents(ctx context.Context, limit int) ([]*domain.BillingOutboxEvent, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, event_type, payload, published_at, created_at
		FROM billing_outbox
		WHERE published_at IS NULL
		ORDER BY created_at ASC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*domain.BillingOutboxEvent
	for rows.Next() {
		e := &domain.BillingOutboxEvent{}
		if err := rows.Scan(&e.ID, &e.EventType, &e.Payload, &e.PublishedAt, &e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func (r *postgresRepository) MarkOutboxEventPublished(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	_, err := r.db.ExecContext(ctx, `
		UPDATE billing_outbox SET published_at = $1 WHERE id = $2`, now, id)
	return err
}

// ─── Scan helpers ─────────────────────────────────────────────────────────────

type scanner interface {
	Scan(dest ...interface{}) error
}

func scanTier(s scanner) (*domain.SubscriptionTier, error) {
	t := &domain.SubscriptionTier{}
	var featuresJSON, limitsJSON []byte
	err := s.Scan(
		&t.ID, &t.Name, &t.Slug, &t.Description,
		&t.MonthlyPrice, &t.YearlyPrice,
		&featuresJSON, &limitsJSON,
		&t.DisplayOrder, &t.IsActive, &t.IsPublic,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(featuresJSON, &t.Features)
	_ = json.Unmarshal(limitsJSON, &t.Limits)
	return t, nil
}

func scanGateway(s scanner) (*domain.PaymentGateway, error) {
	gw := &domain.PaymentGateway{}
	var configJSON []byte
	err := s.Scan(
		&gw.ID, &gw.GatewayID, &gw.Name, &gw.Description,
		&configJSON, &gw.Active, &gw.CreatedAt, &gw.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(configJSON, &gw.Config)
	return gw, nil
}

func scanSubscription(s scanner) (*domain.UserSubscription, error) {
	sub := &domain.UserSubscription{}
	err := s.Scan(
		&sub.ID, &sub.UserID, &sub.TierID, &sub.GatewayID,
		&sub.ExternalSubscriptionID, &sub.ExternalCustomerID,
		&sub.Status, &sub.BillingCycle,
		&sub.CurrentPeriodStart, &sub.CurrentPeriodEnd,
		&sub.CancelAtPeriodEnd, &sub.CanceledAt,
		&sub.TrialStart, &sub.TrialEnd,
		&sub.CreatedAt, &sub.UpdatedAt,
	)
	return sub, err
}

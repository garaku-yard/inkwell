package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"inkwell/server/internal/billing/domain"
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

// subscriptionInsert is the shared SQL used by both the non-transactional and
// transactional variants of CreateSubscription.
const subscriptionInsert = `
	INSERT INTO user_subscriptions
	  (id, user_id, tier_id, gateway_id, external_subscription_id, external_customer_id,
	   status, billing_cycle, current_period_start, current_period_end,
	   cancel_at_period_end, created_at, updated_at)
	VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`

func (r *postgresRepository) CreateSubscription(ctx context.Context, sub *domain.UserSubscription) error {
	_, err := r.db.ExecContext(ctx, subscriptionInsert,
		sub.ID, sub.UserID, sub.TierID, sub.GatewayID,
		sub.ExternalSubscriptionID, sub.ExternalCustomerID,
		sub.Status, sub.BillingCycle,
		sub.CurrentPeriodStart, sub.CurrentPeriodEnd,
		sub.CancelAtPeriodEnd, sub.CreatedAt, sub.UpdatedAt,
	)
	return err
}

// CreateSubscriptionTx runs the same insert as CreateSubscription inside the
// caller-provided transaction. The service layer commits this together with
// the matching outbox event so both land or neither does.
func (r *postgresRepository) CreateSubscriptionTx(ctx context.Context, tx *sql.Tx, sub *domain.UserSubscription) error {
	_, err := tx.ExecContext(ctx, subscriptionInsert,
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

// subscriptionUpdate is the shared UPDATE SQL used by both variants.
const subscriptionUpdate = `
	UPDATE user_subscriptions SET
	  status = $1, billing_cycle = $2, current_period_start = $3,
	  current_period_end = $4, cancel_at_period_end = $5,
	  canceled_at = $6, updated_at = $7
	WHERE id = $8`

func (r *postgresRepository) UpdateSubscription(ctx context.Context, sub *domain.UserSubscription) error {
	_, err := r.db.ExecContext(ctx, subscriptionUpdate,
		sub.Status, sub.BillingCycle, sub.CurrentPeriodStart,
		sub.CurrentPeriodEnd, sub.CancelAtPeriodEnd,
		sub.CanceledAt, time.Now(), sub.ID,
	)
	return err
}

// UpdateSubscriptionTx runs the same update as UpdateSubscription inside the
// caller-provided transaction, paired with an outbox enqueue by the service layer.
func (r *postgresRepository) UpdateSubscriptionTx(ctx context.Context, tx *sql.Tx, sub *domain.UserSubscription) error {
	_, err := tx.ExecContext(ctx, subscriptionUpdate,
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

// Outbox CRUD lives in pkg/outbox.PostgresStore against the billing_outbox table.
// Subscription-changing service methods begin a transaction via outbox.RunInTx,
// call the *Tx variants on this repository, and enqueue the event via the store —
// keeping the subscription row and its matching event atomic.

// ─── Usage tracking ───────────────────────────────────────────────────────────

// TrackUsage appends a row to usage_events and upserts the running total in
// user_usage_totals, both inside a single transaction so the log and aggregate
// never drift out of sync.
func (r *postgresRepository) TrackUsage(ctx context.Context, userID uuid.UUID, metric string, quantity int64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO usage_events (user_id, metric_name, quantity) VALUES ($1, $2, $3)`,
		userID, metric, quantity,
	); err != nil {
		return fmt.Errorf("insert usage_event: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO user_usage_totals (user_id, metric_name, total, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (user_id, metric_name)
		DO UPDATE SET total = user_usage_totals.total + EXCLUDED.total, updated_at = NOW()`,
		userID, metric, quantity,
	); err != nil {
		return fmt.Errorf("upsert usage_total: %w", err)
	}

	return tx.Commit()
}

// GetUsageTotal reads the aggregate total for a user × metric from
// user_usage_totals. Missing rows yield a zero count with no error.
func (r *postgresRepository) GetUsageTotal(ctx context.Context, userID uuid.UUID, metric string) (int64, error) {
	var total int64
	err := r.db.QueryRowContext(ctx,
		`SELECT total FROM user_usage_totals WHERE user_id = $1 AND metric_name = $2`,
		userID, metric,
	).Scan(&total)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read usage_total: %w", err)
	}
	return total, nil
}

// ListUserUsage returns a map of every tracked metric to its current total
// for the given user. Returns an empty map when the user has no usage yet.
func (r *postgresRepository) ListUserUsage(ctx context.Context, userID uuid.UUID) (map[string]int64, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT metric_name, total FROM user_usage_totals WHERE user_id = $1`, userID)
	if err != nil {
		return nil, fmt.Errorf("list usage_totals: %w", err)
	}
	defer rows.Close()

	out := map[string]int64{}
	for rows.Next() {
		var metric string
		var total int64
		if err := rows.Scan(&metric, &total); err != nil {
			return nil, err
		}
		out[metric] = total
	}
	return out, rows.Err()
}

// ─── Analytics ────────────────────────────────────────────────────────────────

// GetAnalytics assembles the admin dashboard's billing KPIs in a single
// query pass. MRR is computed by joining active subscriptions against their
// tiers and summing monthly_price (halving yearly-cycle subscriptions to a
// monthly-equivalent). Churn is measured as cancellations in the last 30
// days over the active count at query time.
func (r *postgresRepository) GetAnalytics(ctx context.Context) (*domain.BillingAnalytics, error) {
	result := &domain.BillingAnalytics{}

	// MRR and per-tier breakdown in one pass: every active subscription
	// contributes its monthly-equivalent price (yearly cycles / 12).
	rows, err := r.db.QueryContext(ctx, `
		SELECT
		  t.id,
		  t.name,
		  COUNT(*) AS subscribers,
		  SUM(CASE WHEN s.billing_cycle = 'yearly' THEN t.yearly_price / 12.0 ELSE t.monthly_price END) AS mrr_contribution
		FROM user_subscriptions s
		JOIN subscription_tiers t ON s.tier_id = t.id
		WHERE s.deleted_at IS NULL
		  AND s.status = 'active'
		GROUP BY t.id, t.name
		ORDER BY mrr_contribution DESC`)
	if err != nil {
		return nil, fmt.Errorf("analytics: per-tier query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var tierID uuid.UUID
		var tierName string
		var count int64
		var contribution float64
		if err := rows.Scan(&tierID, &tierName, &count, &contribution); err != nil {
			return nil, err
		}
		result.MRR += contribution
		result.TierDistribution = append(result.TierDistribution, domain.TierCount{
			TierID: tierID, TierName: tierName, Count: count,
		})
		result.RevenueByTier = append(result.RevenueByTier, domain.TierRevenue{
			TierID: tierID, TierName: tierName, Revenue: contribution,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	result.ARR = result.MRR * 12

	// Churn: cancellations in the last 30 days / current active count.
	// Using canceled_at (set by CancelSubscription) rather than status, so
	// recently canceled but still-in-period subs are counted.
	var canceled30d, activeCount int64
	if err := r.db.QueryRowContext(ctx, `
		SELECT
		  COUNT(*) FILTER (WHERE canceled_at IS NOT NULL AND canceled_at >= NOW() - INTERVAL '30 days'),
		  COUNT(*) FILTER (WHERE status = 'active')
		FROM user_subscriptions
		WHERE deleted_at IS NULL`).Scan(&canceled30d, &activeCount); err != nil {
		return nil, fmt.Errorf("analytics: churn query: %w", err)
	}
	if activeCount > 0 {
		result.ChurnRate = float64(canceled30d) / float64(activeCount)
	}

	return result, nil
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

package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
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
		       features, limits, display_order, is_active, is_public, is_default, per_seat, created_at, updated_at
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
		       features, limits, display_order, is_active, is_public, is_default, per_seat, created_at, updated_at
		FROM subscription_tiers
		WHERE id = $1 AND deleted_at IS NULL`, id)
	t, err := scanTier(row)
	if err == sql.ErrNoRows {
		return nil, domain.ErrTierNotFound
	}
	return t, err
}

// ListAllTiers returns every non-deleted tier (incl. inactive/non-public) for
// the admin editor, ordered by display_order.
func (r *postgresRepository) ListAllTiers(ctx context.Context) ([]*domain.SubscriptionTier, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, slug, description, monthly_price, yearly_price,
		       features, limits, display_order, is_active, is_public, is_default, per_seat, created_at, updated_at
		FROM subscription_tiers
		WHERE deleted_at IS NULL
		ORDER BY display_order ASC`)
	if err != nil {
		return nil, fmt.Errorf("list all tiers: %w", err)
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

// GetDefaultTier returns the tier applied to users with no subscription.
// Returns ErrTierNotFound when none is marked default.
func (r *postgresRepository) GetDefaultTier(ctx context.Context) (*domain.SubscriptionTier, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, name, slug, description, monthly_price, yearly_price,
		       features, limits, display_order, is_active, is_public, is_default, per_seat, created_at, updated_at
		FROM subscription_tiers
		WHERE is_default = true AND deleted_at IS NULL
		LIMIT 1`)
	t, err := scanTier(row)
	if err == sql.ErrNoRows {
		return nil, domain.ErrTierNotFound
	}
	return t, err
}

func (r *postgresRepository) CreateTier(ctx context.Context, t *domain.SubscriptionTier) error {
	features, _ := json.Marshal(t.Features)
	limits, _ := json.Marshal(t.Limits)
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO subscription_tiers
		  (id, name, slug, description, monthly_price, yearly_price, features, limits,
		   display_order, is_active, is_public, per_seat)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		t.ID, t.Name, t.Slug, t.Description, t.MonthlyPrice, t.YearlyPrice,
		features, limits, t.DisplayOrder, t.IsActive, t.IsPublic, t.PerSeat,
	)
	if err != nil {
		return fmt.Errorf("create tier: %w", err)
	}
	return nil
}

func (r *postgresRepository) UpdateTier(ctx context.Context, t *domain.SubscriptionTier) error {
	features, _ := json.Marshal(t.Features)
	limits, _ := json.Marshal(t.Limits)
	res, err := r.db.ExecContext(ctx, `
		UPDATE subscription_tiers SET
		  name=$2, slug=$3, description=$4, monthly_price=$5, yearly_price=$6,
		  features=$7, limits=$8, display_order=$9, is_active=$10, is_public=$11,
		  per_seat=$12, updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL`,
		t.ID, t.Name, t.Slug, t.Description, t.MonthlyPrice, t.YearlyPrice,
		features, limits, t.DisplayOrder, t.IsActive, t.IsPublic, t.PerSeat,
	)
	if err != nil {
		return fmt.Errorf("update tier: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return domain.ErrTierNotFound
	}
	return nil
}

// DeleteTier soft-deletes a tier. The default tier can't be deleted (it must
// always exist for the "no subscription = free" resolution).
func (r *postgresRepository) DeleteTier(ctx context.Context, id uuid.UUID) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE subscription_tiers SET deleted_at = NOW(), updated_at = NOW()
		 WHERE id = $1 AND deleted_at IS NULL AND is_default = false`, id)
	if err != nil {
		return fmt.Errorf("delete tier: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return domain.ErrTierNotFound
	}
	return nil
}

// ReorderTiers sets display_order to each id's position in the slice, in one tx.
func (r *postgresRepository) ReorderTiers(ctx context.Context, ids []uuid.UUID) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("reorder tiers: begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck
	for i, id := range ids {
		if _, err := tx.ExecContext(ctx,
			`UPDATE subscription_tiers SET display_order=$2, updated_at=NOW() WHERE id=$1`, id, i,
		); err != nil {
			return fmt.Errorf("reorder tiers: %w", err)
		}
	}
	return tx.Commit()
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

func (r *postgresRepository) GetGatewayByKey(ctx context.Context, gatewayID string) (*domain.PaymentGateway, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, gateway_id, name, description, config, active, created_at, updated_at
		FROM payment_gateways WHERE gateway_id = $1`, gatewayID)
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
	   cancel_at_period_end, quantity, created_at, updated_at)
	VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`

// subscriptionInsertArgs is the ordered argument list shared by both
// CreateSubscription variants, keeping the placeholder count in one place.
func subscriptionInsertArgs(sub *domain.UserSubscription) []any {
	return []any{
		sub.ID, sub.UserID, sub.TierID, sub.GatewayID,
		sub.ExternalSubscriptionID, sub.ExternalCustomerID,
		sub.Status, sub.BillingCycle,
		sub.CurrentPeriodStart, sub.CurrentPeriodEnd,
		sub.CancelAtPeriodEnd, clampQuantity(sub.Quantity),
		sub.CreatedAt, sub.UpdatedAt,
	}
}

// clampQuantity ensures a sane seat count: the column is NOT NULL DEFAULT 1, so a
// zero-valued domain struct would otherwise write 0 seats.
func clampQuantity(q int) int {
	if q < 1 {
		return 1
	}
	return q
}

func (r *postgresRepository) CreateSubscription(ctx context.Context, sub *domain.UserSubscription) error {
	_, err := r.db.ExecContext(ctx, subscriptionInsert, subscriptionInsertArgs(sub)...)
	return err
}

// CreateSubscriptionTx runs the same insert as CreateSubscription inside the
// caller-provided transaction. The service layer commits this together with
// the matching outbox event so both land or neither does.
func (r *postgresRepository) CreateSubscriptionTx(ctx context.Context, tx *sql.Tx, sub *domain.UserSubscription) error {
	_, err := tx.ExecContext(ctx, subscriptionInsert, subscriptionInsertArgs(sub)...)
	return err
}

func (r *postgresRepository) GetSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (*domain.UserSubscription, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, user_id, tier_id, gateway_id, external_subscription_id, external_customer_id,
		       status, billing_cycle, current_period_start, current_period_end,
		       cancel_at_period_end, canceled_at, trial_start, trial_end, quantity, created_at, updated_at
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
		       cancel_at_period_end, canceled_at, trial_start, trial_end, quantity, created_at, updated_at
		FROM user_subscriptions WHERE id = $1 AND deleted_at IS NULL`, id)
	sub, err := scanSubscription(row)
	if err == sql.ErrNoRows {
		return nil, domain.ErrSubscriptionNotFound
	}
	return sub, err
}

func (r *postgresRepository) GetSubscriptionByExternalID(ctx context.Context, externalID string) (*domain.UserSubscription, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, user_id, tier_id, gateway_id, external_subscription_id, external_customer_id,
		       status, billing_cycle, current_period_start, current_period_end,
		       cancel_at_period_end, canceled_at, trial_start, trial_end, quantity, created_at, updated_at
		FROM user_subscriptions WHERE external_subscription_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC LIMIT 1`, externalID)
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
	  canceled_at = $6, quantity = $7, updated_at = $8
	WHERE id = $9`

// subscriptionUpdateArgs is the ordered argument list shared by both
// UpdateSubscription variants. now is passed in so the Tx and non-Tx paths agree.
func subscriptionUpdateArgs(sub *domain.UserSubscription, now time.Time) []any {
	return []any{
		sub.Status, sub.BillingCycle, sub.CurrentPeriodStart,
		sub.CurrentPeriodEnd, sub.CancelAtPeriodEnd,
		sub.CanceledAt, clampQuantity(sub.Quantity), now, sub.ID,
	}
}

func (r *postgresRepository) UpdateSubscription(ctx context.Context, sub *domain.UserSubscription) error {
	_, err := r.db.ExecContext(ctx, subscriptionUpdate, subscriptionUpdateArgs(sub, time.Now())...)
	return err
}

// UpdateSubscriptionTx runs the same update as UpdateSubscription inside the
// caller-provided transaction, paired with an outbox enqueue by the service layer.
func (r *postgresRepository) UpdateSubscriptionTx(ctx context.Context, tx *sql.Tx, sub *domain.UserSubscription) error {
	_, err := tx.ExecContext(ctx, subscriptionUpdate, subscriptionUpdateArgs(sub, time.Now())...)
	return err
}

func (r *postgresRepository) ListSubscriptions(ctx context.Context, offset, limit int, statusFilter string) ([]*domain.UserSubscription, int, error) {
	query := `
		SELECT id, user_id, tier_id, gateway_id, external_subscription_id, external_customer_id,
		       status, billing_cycle, current_period_start, current_period_end,
		       cancel_at_period_end, canceled_at, trial_start, trial_end, quantity, created_at, updated_at
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
// GetMonthlyUsage sums a user's usage events for a metric within the current
// calendar month (server timezone). Used to enforce managed-AI allowances.
func (r *postgresRepository) GetMonthlyUsage(ctx context.Context, userID uuid.UUID, metric string) (int64, error) {
	var total int64
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(quantity), 0) FROM usage_events
		WHERE user_id = $1 AND metric_name = $2 AND occurred_at >= date_trunc('month', now())`,
		userID, metric,
	).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("get monthly usage: %w", err)
	}
	return total, nil
}

// InsertUsageEvents writes a batch of usage events in one multi-row insert.
func (r *postgresRepository) InsertUsageEvents(ctx context.Context, events []domain.UsageEvent) error {
	if len(events) == 0 {
		return nil
	}
	var (
		placeholders = make([]string, 0, len(events))
		args         = make([]any, 0, len(events)*3)
	)
	for i, e := range events {
		n := i * 3
		placeholders = append(placeholders, fmt.Sprintf("($%d,$%d,$%d)", n+1, n+2, n+3))
		args = append(args, e.UserID, e.Metric, e.Quantity)
	}
	query := "INSERT INTO usage_events (user_id, metric_name, quantity) VALUES " + strings.Join(placeholders, ",")
	_, err := r.db.ExecContext(ctx, query, args...)
	return err
}

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
		&t.DisplayOrder, &t.IsActive, &t.IsPublic, &t.IsDefault, &t.PerSeat,
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
	// The external id columns are nullable (set only once a payment gateway
	// issues them); scan through NullString so a pre-gateway/manual row with
	// NULLs doesn't fail the whole query.
	var extSub, extCust sql.NullString
	err := s.Scan(
		&sub.ID, &sub.UserID, &sub.TierID, &sub.GatewayID,
		&extSub, &extCust,
		&sub.Status, &sub.BillingCycle,
		&sub.CurrentPeriodStart, &sub.CurrentPeriodEnd,
		&sub.CancelAtPeriodEnd, &sub.CanceledAt,
		&sub.TrialStart, &sub.TrialEnd, &sub.Quantity,
		&sub.CreatedAt, &sub.UpdatedAt,
	)
	sub.ExternalSubscriptionID = extSub.String
	sub.ExternalCustomerID = extCust.String
	return sub, err
}

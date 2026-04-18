// Package quota defines the canonical set of usage metrics that services
// track against a user's subscription tier, and helpers for checking whether
// a proposed action would exceed a user's quota.
//
// The package is intentionally small: it carries the metric vocabulary and
// the Checker / Tracker interfaces. Billing service implements them against
// its database (usage_events + user_usage_totals tables), and other services
// consume them via the billing gRPC client.
//
// Usage pattern (inside scripts service):
//
//	if err := quota.Require(ctx, quotaClient, userID, quota.MetricProjects); err != nil {
//	    return nil, err
//	}
//	// ... create project ...
//	quotaClient.Track(ctx, userID, quota.MetricProjects, 1)
package quota

import (
	"context"
	"errors"
	"fmt"
)

// Metric is the name of a tracked usage dimension. Values are stable strings
// persisted in the database and sent over the wire — never rename an existing
// value; add a new one instead.
type Metric string

const (
	// MetricProjects counts projects a user owns. Enforced against the tier's
	// `max_projects` limit.
	MetricProjects Metric = "projects"
	// MetricCollaborators counts collaborators added to the user's projects.
	// Enforced against `max_collaborators_per_project`.
	MetricCollaborators Metric = "collaborators"
	// MetricAITokens counts AI chat tokens consumed. Enforced against `ai_tokens`.
	MetricAITokens Metric = "ai_tokens"
	// MetricExports counts document exports (PDF/FDX) performed. Enforced against
	// `exports_per_month`.
	MetricExports Metric = "exports"
)

// ErrQuotaExceeded is returned by Require when adding the requested quantity
// would push the user past the tier limit for the metric.
var ErrQuotaExceeded = errors.New("quota exceeded")

// Checker reads a user's current usage for a metric and the matching tier limit.
// A Limit of -1 signals "unlimited" (no enforcement).
type Checker interface {
	// Check returns the current used amount and the limit for the given metric.
	// limit == -1 means unlimited.
	Check(ctx context.Context, userID string, metric Metric) (used int64, limit int64, err error)
}

// Tracker increments a user's recorded usage for a metric. Implementations must
// be idempotent-safe per-event; callers typically pair Track with a successful
// business write.
type Tracker interface {
	// Track adds quantity to the user's running total for metric.
	Track(ctx context.Context, userID string, metric Metric, quantity int64) error
}

// Client combines Checker and Tracker for callers that need both.
type Client interface {
	Checker
	Tracker
}

// Require verifies that the user has headroom to add `quantity` to `metric`
// and returns ErrQuotaExceeded (wrapped with context) if not. Pass quantity=1
// for the common "can the user create one more of X?" question.
func Require(ctx context.Context, c Checker, userID string, metric Metric, quantity int64) error {
	used, limit, err := c.Check(ctx, userID, metric)
	if err != nil {
		return fmt.Errorf("quota: check %s: %w", metric, err)
	}
	if limit < 0 {
		return nil
	}
	if used+quantity > limit {
		return fmt.Errorf("quota %s: used %d / limit %d: %w", metric, used, limit, ErrQuotaExceeded)
	}
	return nil
}

// LimitFromTier extracts the numeric limit for `metric` from a tier's Limits
// map. Missing keys are treated as unlimited (returns -1). Values may be stored
// as float64 (from JSON) or int64; both are handled.
func LimitFromTier(limits map[string]interface{}, metric Metric) int64 {
	key := limitKeyFor(metric)
	raw, ok := limits[key]
	if !ok {
		return -1
	}
	switch v := raw.(type) {
	case float64:
		return int64(v)
	case int64:
		return v
	case int:
		return int64(v)
	default:
		return -1
	}
}

// limitKeyFor maps a Metric to the key used in SubscriptionTier.Limits. Keys
// are stable and must not be renamed without a migration.
func limitKeyFor(metric Metric) string {
	switch metric {
	case MetricProjects:
		return "max_projects"
	case MetricCollaborators:
		return "max_collaborators_per_project"
	case MetricAITokens:
		return "ai_tokens"
	case MetricExports:
		return "exports_per_month"
	default:
		return string(metric)
	}
}

// Package billingadapter adapts the billing gRPC client to the quota.Client
// interface so that any service can enforce quotas and report usage using the
// pkg/quota vocabulary without depending on billing's proto types directly.
package billingadapter

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	billingpb "inkwell/server/pkg/grpc/billing"
	"inkwell/server/pkg/quota"
)

// Client wraps a billing gRPC client and exposes the quota.Client surface.
// A single instance is safe for concurrent use since billing gRPC clients are.
type Client struct {
	billing billingpb.BillingServiceClient
}

// New returns a quota-compatible client backed by the given billing gRPC client.
func New(billing billingpb.BillingServiceClient) *Client {
	return &Client{billing: billing}
}

// Check reads the user's current usage for metric and the matching tier limit.
// The limit comes from the user's EFFECTIVE tier — their subscription's tier,
// or the default (Free) tier when they have no subscription — so unsubscribed
// users are capped at the free limits, not treated as unlimited. -1 signals
// unlimited. If billing can't resolve a tier at all (e.g. no default
// configured / billing down), the limit stays -1 so the system fails open
// rather than locking everyone out. Callers that need a per-project usage
// value, such as collaborator seats, resolve that usage at their own boundary.
func (c *Client) Check(ctx context.Context, userID string, metric quota.Metric) (used int64, limit int64, err error) {
	if _, err := uuid.Parse(userID); err != nil {
		return 0, 0, fmt.Errorf("quota: invalid user_id: %w", err)
	}

	limit = -1
	tierResp, tierErr := c.billing.GetEffectiveTier(ctx, &billingpb.GetEffectiveTierRequest{UserId: userID})
	if tierErr == nil && tierResp.GetPlan() != nil {
		limit = planLimit(tierResp.GetPlan(), metric)
	}

	usageResp, err := c.billing.GetUserUsage(ctx, &billingpb.GetUserUsageRequest{
		UserId:     userID,
		MetricName: string(metric),
	})
	if err != nil {
		return 0, 0, fmt.Errorf("quota: fetch usage: %w", err)
	}
	for _, u := range usageResp.GetUsage() {
		if u.GetMetricName() == string(metric) {
			used = u.GetQuantity()
			break
		}
	}
	return used, limit, nil
}

// Track records a +quantity increment for the user's metric via the billing
// service. Errors propagate unchanged so callers can decide whether to fail
// the operation or log and continue.
func (c *Client) Track(ctx context.Context, userID string, metric quota.Metric, quantity int64) error {
	if _, err := uuid.Parse(userID); err != nil {
		return fmt.Errorf("quota: invalid user_id: %w", err)
	}
	_, err := c.billing.TrackUsage(ctx, &billingpb.TrackUsageRequest{
		UserId:     userID,
		MetricName: string(metric),
		Quantity:   quantity,
	})
	return err
}

// planLimit extracts the tier limit for metric from a proto Plan. Returns -1
// when the plan does not carry an explicit limit for the metric (treated as
// unlimited) or when metric has no matching plan field yet.
func planLimit(plan *billingpb.Plan, metric quota.Metric) int64 {
	if plan == nil {
		return -1
	}
	switch metric {
	case quota.MetricProjects:
		if plan.GetMaxProjects() > 0 {
			return int64(plan.GetMaxProjects())
		}
	case quota.MetricCollaborators:
		if plan.GetMaxCollaboratorsPerProject() > 0 {
			return int64(plan.GetMaxCollaboratorsPerProject())
		}
	case quota.MetricAITokens:
		if plan.GetAiTokensPerMonth() > 0 {
			return plan.GetAiTokensPerMonth()
		}
	}
	return -1
}

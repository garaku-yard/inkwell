// Package handler implements the BillingService gRPC server.
package handler

import (
	"context"
	"log/slog"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/billing/domain"
	"inkwell/server/internal/billing/service"
	billingpb "inkwell/server/pkg/grpc/billing"

	"github.com/google/uuid"
)

// BillingHandler implements billingpb.BillingServiceServer.
type BillingHandler struct {
	billingpb.UnimplementedBillingServiceServer
	svc service.BillingService
}

// NewBillingHandler creates a new BillingHandler backed by svc.
func NewBillingHandler(svc service.BillingService) *BillingHandler {
	return &BillingHandler{svc: svc}
}

// GetPlans returns all active subscription tiers mapped to the Plan proto.
func (h *BillingHandler) GetPlans(ctx context.Context, req *billingpb.GetPlansRequest) (*billingpb.GetPlansResponse, error) {
	tiers, err := h.svc.ListTiers(ctx)
	if err != nil {
		return nil, handleError(err)
	}

	plans := make([]*billingpb.Plan, 0, len(tiers))
	for _, t := range tiers {
		plans = append(plans, tierToPlan(t))
	}
	return &billingpb.GetPlansResponse{Plans: plans}, nil
}

// GetPlan returns a single tier by ID.
func (h *BillingHandler) GetPlan(ctx context.Context, req *billingpb.GetPlanRequest) (*billingpb.GetPlanResponse, error) {
	id, err := uuid.Parse(req.PlanId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid plan_id")
	}
	tier, err := h.svc.GetTierByID(ctx, id)
	if err != nil {
		return nil, handleError(err)
	}
	return &billingpb.GetPlanResponse{Plan: tierToPlan(tier)}, nil
}

// GetEffectiveTier returns the tier whose limits apply to a user (their
// subscription's tier, or the default), as the public Plan projection.
func (h *BillingHandler) GetEffectiveTier(ctx context.Context, req *billingpb.GetEffectiveTierRequest) (*billingpb.GetEffectiveTierResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	tier, err := h.svc.GetEffectiveTier(ctx, userID)
	if err != nil {
		return nil, handleError(err)
	}
	return &billingpb.GetEffectiveTierResponse{Plan: tierToPlan(tier)}, nil
}

// ListAllTiers returns every tier (incl. inactive/non-public) for the admin editor.
func (h *BillingHandler) ListAllTiers(ctx context.Context, _ *billingpb.ListAllTiersRequest) (*billingpb.ListAllTiersResponse, error) {
	tiers, err := h.svc.ListAllTiers(ctx)
	if err != nil {
		return nil, handleError(err)
	}
	out := make([]*billingpb.SubscriptionTier, 0, len(tiers))
	for _, t := range tiers {
		out = append(out, tierToProto(t))
	}
	return &billingpb.ListAllTiersResponse{Tiers: out}, nil
}

// CreateTier creates a new subscription tier.
func (h *BillingHandler) CreateTier(ctx context.Context, req *billingpb.CreateTierRequest) (*billingpb.CreateTierResponse, error) {
	if req.Tier == nil || req.Tier.Name == "" {
		return nil, status.Error(codes.InvalidArgument, "tier name is required")
	}
	t, err := h.svc.CreateTier(ctx, protoToTier(req.Tier))
	if err != nil {
		return nil, handleError(err)
	}
	return &billingpb.CreateTierResponse{Tier: tierToProto(t)}, nil
}

// UpdateTier updates an existing tier.
func (h *BillingHandler) UpdateTier(ctx context.Context, req *billingpb.UpdateTierRequest) (*billingpb.UpdateTierResponse, error) {
	if req.Tier == nil {
		return nil, status.Error(codes.InvalidArgument, "tier is required")
	}
	dt := protoToTier(req.Tier)
	if dt.ID == uuid.Nil {
		return nil, status.Error(codes.InvalidArgument, "valid tier id is required")
	}
	t, err := h.svc.UpdateTier(ctx, dt)
	if err != nil {
		return nil, handleError(err)
	}
	return &billingpb.UpdateTierResponse{Tier: tierToProto(t)}, nil
}

// DeleteTier soft-deletes a tier (the default tier can't be deleted).
func (h *BillingHandler) DeleteTier(ctx context.Context, req *billingpb.DeleteTierRequest) (*billingpb.DeleteTierResponse, error) {
	id, err := uuid.Parse(req.Id)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid tier id")
	}
	if err := h.svc.DeleteTier(ctx, id); err != nil {
		return nil, handleError(err)
	}
	return &billingpb.DeleteTierResponse{Success: true}, nil
}

// ReorderTiers sets display_order to each tier id's position in the list.
func (h *BillingHandler) ReorderTiers(ctx context.Context, req *billingpb.ReorderTiersRequest) (*billingpb.ReorderTiersResponse, error) {
	ids := make([]uuid.UUID, 0, len(req.TierIds))
	for _, s := range req.TierIds {
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, "invalid tier id: "+s)
		}
		ids = append(ids, id)
	}
	if err := h.svc.ReorderTiers(ctx, ids); err != nil {
		return nil, handleError(err)
	}
	return &billingpb.ReorderTiersResponse{Success: true}, nil
}

// GetUserSubscription returns the active subscription for a user.
func (h *BillingHandler) GetUserSubscription(ctx context.Context, req *billingpb.GetUserSubscriptionRequest) (*billingpb.GetUserSubscriptionResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	sub, err := h.svc.GetUserSubscription(ctx, userID)
	if err != nil {
		return nil, handleError(err)
	}
	return &billingpb.GetUserSubscriptionResponse{
		Subscription: subscriptionToProto(sub),
	}, nil
}

// CancelSubscription marks a subscription to cancel at period end.
func (h *BillingHandler) CancelSubscription(ctx context.Context, req *billingpb.CancelSubscriptionRequest) (*billingpb.CancelSubscriptionResponse, error) {
	subID, err := uuid.Parse(req.SubscriptionId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid subscription_id")
	}
	if err := h.svc.CancelSubscription(ctx, subID); err != nil {
		return nil, handleError(err)
	}
	return &billingpb.CancelSubscriptionResponse{}, nil
}

// TrackUsage records a usage increment for a user. Called by other services
// (typically via the gateway's billing gRPC client) whenever a tracked action
// succeeds — e.g. scripts service calls this after CreateProject to record a
// +1 against the `projects` metric.
func (h *BillingHandler) TrackUsage(ctx context.Context, req *billingpb.TrackUsageRequest) (*billingpb.TrackUsageResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	if req.MetricName == "" {
		return nil, status.Error(codes.InvalidArgument, "metric_name is required")
	}
	qty := req.Quantity
	if qty == 0 {
		qty = 1
	}
	if err := h.svc.TrackUsage(ctx, userID, req.MetricName, qty); err != nil {
		slog.Warn("TrackUsage failed", "user_id", req.UserId, "metric", req.MetricName, "error", err)
		return nil, handleError(err)
	}
	return &billingpb.TrackUsageResponse{Success: true}, nil
}

// GetUserUsage returns the user's current usage totals keyed by metric. Each
// entry carries the total quantity recorded to date; rate-limit windows are
// enforced at the caller level against the user's subscription tier limits.
func (h *BillingHandler) GetUserUsage(ctx context.Context, req *billingpb.GetUserUsageRequest) (*billingpb.GetUserUsageResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	totals, err := h.svc.GetUserUsage(ctx, userID)
	if err != nil {
		return nil, handleError(err)
	}

	out := make([]*billingpb.Usage, 0, len(totals))
	for metric, total := range totals {
		if req.MetricName != "" && metric != req.MetricName {
			continue
		}
		out = append(out, &billingpb.Usage{
			UserId:     req.UserId,
			MetricName: metric,
			Quantity:   total,
		})
	}
	return &billingpb.GetUserUsageResponse{Usage: out}, nil
}

// GetBillingAnalytics returns admin KPIs (MRR, ARR, churn, tier distribution)
// computed from current subscription data. Authorization is enforced upstream
// at the gateway via the adminAuth middleware.
func (h *BillingHandler) GetBillingAnalytics(ctx context.Context, req *billingpb.GetBillingAnalyticsRequest) (*billingpb.GetBillingAnalyticsResponse, error) {
	a, err := h.svc.GetAnalytics(ctx)
	if err != nil {
		return nil, handleError(err)
	}

	resp := &billingpb.GetBillingAnalyticsResponse{
		Mrr:       a.MRR,
		Arr:       a.ARR,
		ChurnRate: a.ChurnRate,
	}
	for _, tc := range a.TierDistribution {
		resp.TierDistribution = append(resp.TierDistribution, &billingpb.TierDistributionEntry{
			TierId:   tc.TierID.String(),
			TierName: tc.TierName,
			Count:    tc.Count,
		})
	}
	for _, tr := range a.RevenueByTier {
		resp.RevenueByTier = append(resp.RevenueByTier, &billingpb.RevenueByTierEntry{
			TierId:   tr.TierID.String(),
			TierName: tr.TierName,
			Revenue:  tr.Revenue,
		})
	}
	return resp, nil
}

// ListAllSubscriptions returns every subscription across all users with optional
// status filter and pagination. Used by the admin subscriptions table.
func (h *BillingHandler) ListAllSubscriptions(ctx context.Context, req *billingpb.ListAllSubscriptionsRequest) (*billingpb.ListAllSubscriptionsResponse, error) {
	offset := int(req.Offset)
	limit := int(req.Limit)
	if limit <= 0 {
		limit = 50
	}

	subs, total, err := h.svc.ListAllSubscriptions(ctx, offset, limit, req.StatusFilter)
	if err != nil {
		return nil, handleError(err)
	}

	out := make([]*billingpb.Subscription, 0, len(subs))
	for _, s := range subs {
		out = append(out, subscriptionToProto(s))
	}
	return &billingpb.ListAllSubscriptionsResponse{Subscriptions: out, Total: int32(total)}, nil
}

// ─── Error mapping ────────────────────────────────────────────────────────────

// handleError translates domain errors to gRPC status codes.
func handleError(err error) error {
	switch err {
	case domain.ErrTierNotFound, domain.ErrSubscriptionNotFound, domain.ErrGatewayNotFound:
		return status.Error(codes.NotFound, err.Error())
	case domain.ErrSubscriptionAlreadyExists:
		return status.Error(codes.AlreadyExists, err.Error())
	case domain.ErrInvalidStatus:
		return status.Error(codes.InvalidArgument, err.Error())
	default:
		return status.Errorf(codes.Internal, "internal error: %v", err)
	}
}

// ─── Proto converters ─────────────────────────────────────────────────────────

// tierToPlan converts a domain SubscriptionTier to the Plan proto. Monthly price
// is converted from a float (dollars) to integer cents. Limits and feature flags
// are read from the generic JSONB maps stored on the tier; missing keys are left
// at their proto zero values rather than failing.
func tierToPlan(t *domain.SubscriptionTier) *billingpb.Plan {
	p := &billingpb.Plan{
		Id:          t.ID.String(),
		Name:        t.Name,
		Description: t.Description,
		PriceCents:  int64(t.MonthlyPrice * 100),
		Currency:    "USD",
	}
	// Only positive limits map to the proto's typed caps; 0/-1 stay at the proto
	// zero value, which the quota adapter reads as unlimited.
	if v := t.Limits["max_projects"]; v > 0 {
		p.MaxProjects = int32(v)
	}
	if v := t.Limits["max_collaborators_per_project"]; v > 0 {
		p.MaxCollaboratorsPerProject = int32(v)
	}
	return p
}

// tierToProto converts a domain tier to the admin-facing SubscriptionTier proto
// (round-trips every field, unlike the lossy Plan projection).
func tierToProto(t *domain.SubscriptionTier) *billingpb.SubscriptionTier {
	return &billingpb.SubscriptionTier{
		Id:                t.ID.String(),
		Name:              t.Name,
		Slug:              t.Slug,
		Description:       t.Description,
		MonthlyPriceCents: int64(t.MonthlyPrice * 100),
		YearlyPriceCents:  int64(t.YearlyPrice * 100),
		DisplayOrder:      int32(t.DisplayOrder),
		IsActive:          t.IsActive,
		IsPublic:          t.IsPublic,
		IsDefault:         t.IsDefault,
		PerSeat:           t.PerSeat,
		Limits:            t.Limits,
		FeatureBullets:    t.Features,
	}
}

// protoToTier converts an admin SubscriptionTier proto into a domain tier.
// is_default is intentionally NOT writable here — the default tier is managed
// separately to preserve the one-default invariant.
func protoToTier(p *billingpb.SubscriptionTier) *domain.SubscriptionTier {
	t := &domain.SubscriptionTier{
		Name:         p.Name,
		Slug:         p.Slug,
		Description:  p.Description,
		MonthlyPrice: float64(p.MonthlyPriceCents) / 100,
		YearlyPrice:  float64(p.YearlyPriceCents) / 100,
		DisplayOrder: int(p.DisplayOrder),
		IsActive:     p.IsActive,
		IsPublic:     p.IsPublic,
		PerSeat:      p.PerSeat,
		Limits:       p.Limits,
		Features:     p.FeatureBullets,
	}
	if p.Id != "" {
		if id, err := uuid.Parse(p.Id); err == nil {
			t.ID = id
		}
	}
	if t.Limits == nil {
		t.Limits = map[string]int64{}
	}
	return t
}

// subscriptionToProto converts a domain UserSubscription to the billing proto
// Subscription message. Only the core identity fields are mapped; billing-cycle
// dates and payment-method details are not yet included.
func subscriptionToProto(s *domain.UserSubscription) *billingpb.Subscription {
	return &billingpb.Subscription{
		Id:     s.ID.String(),
		UserId: s.UserID.String(),
		PlanId: s.TierID.String(),
		Status: s.Status,
	}
}

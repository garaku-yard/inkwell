// Package handler implements the BillingService gRPC server.
package handler

import (
	"context"
	"log/slog"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"scriptlith/server/internal/billing/domain"
	"scriptlith/server/internal/billing/service"
	billingpb "scriptlith/server/pkg/grpc/billing"

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

// TrackUsage is a no-op stub — usage tracking is not yet implemented.
func (h *BillingHandler) TrackUsage(ctx context.Context, req *billingpb.TrackUsageRequest) (*billingpb.TrackUsageResponse, error) {
	slog.Info("TrackUsage called (no-op)", "user_id", req.UserId, "metric", req.MetricName)
	return &billingpb.TrackUsageResponse{Success: true}, nil
}

// GetUserUsage returns zeroes until usage tracking is implemented.
func (h *BillingHandler) GetUserUsage(ctx context.Context, req *billingpb.GetUserUsageRequest) (*billingpb.GetUserUsageResponse, error) {
	return &billingpb.GetUserUsageResponse{
		Usage: []*billingpb.Usage{{UserId: req.UserId}},
	}, nil
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

func tierToPlan(t *domain.SubscriptionTier) *billingpb.Plan {
	p := &billingpb.Plan{
		Id:          t.ID.String(),
		Name:        t.Name,
		Description: t.Description,
		PriceCents:  int64(t.MonthlyPrice * 100),
		Currency:    "USD",
	}
	if v, ok := t.Limits["max_projects"].(float64); ok {
		p.MaxProjects = int32(v)
	}
	if v, ok := t.Limits["max_collaborators"].(float64); ok {
		p.MaxCollaboratorsPerProject = int32(v)
	}
	if v, ok := t.Features["ai_features"].(bool); ok {
		p.AiFeaturesEnabled = v
	}
	if v, ok := t.Features["priority_support"].(bool); ok {
		p.PrioritySupport = v
	}
	return p
}

func subscriptionToProto(s *domain.UserSubscription) *billingpb.Subscription {
	return &billingpb.Subscription{
		Id:     s.ID.String(),
		UserId: s.UserID.String(),
		PlanId: s.TierID.String(),
		Status: s.Status,
	}
}

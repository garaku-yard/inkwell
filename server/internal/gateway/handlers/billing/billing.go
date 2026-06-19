package billing

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
	billingpb "inkwell/server/pkg/grpc/billing"
)

// BillingHandler routes billing HTTP requests to the billing gRPC service.
// It serves plan data from the billing service and admin analytics/gateway
// endpoints, which currently return stub data until a payment processor is configured.
type BillingHandler struct {
	client billingpb.BillingServiceClient
}

// NewBillingHandler creates a BillingHandler using the billing gRPC client in
// the provided registry.
func NewBillingHandler(clients *grpcclient.Registry) *BillingHandler {
	return &BillingHandler{client: clients.Billing}
}

// tierLimitsDTO is the enforced caps an admin edits. -1 means unlimited for the
// numeric caps; businessWorkspaces is the org-workspace gate.
type tierLimitsDTO struct {
	MaxProjects                int64 `json:"maxProjects"`
	MaxCollaboratorsPerProject int64 `json:"maxCollaboratorsPerProject"`
	BusinessWorkspaces         bool  `json:"businessWorkspaces"`
}

// tierDTO is the admin-facing tier shape — exactly the fields the billing model
// persists and the paywall enforces (no speculative themes/storage/branding/
// overage/gateway-mapping fields, which weren't backed by anything). AI token
// allowances arrive with managed AI (Phase B); per-gateway price mappings with
// the Paddle gateway (A1.5).
type tierDTO struct {
	ID                string        `json:"id"`
	Name              string        `json:"name"`
	Slug              string        `json:"slug"`
	Description       string        `json:"description"`
	MonthlyPriceCents int64         `json:"monthlyPriceCents"`
	YearlyPriceCents  int64         `json:"yearlyPriceCents"`
	DisplayOrder      int           `json:"displayOrder"`
	IsActive          bool          `json:"isActive"`
	IsPublic          bool          `json:"isPublic"`
	IsDefault         bool          `json:"isDefault"`
	PerSeat           bool          `json:"perSeat"`
	Limits            tierLimitsDTO `json:"limits"`
	FeatureBullets    []string      `json:"featureBullets"`
}

func protoTierToDTO(t *billingpb.SubscriptionTier) tierDTO {
	limitOr := func(k string, def int64) int64 {
		if v, ok := t.Limits[k]; ok {
			return v
		}
		return def
	}
	bullets := t.FeatureBullets
	if bullets == nil {
		bullets = []string{}
	}
	return tierDTO{
		ID:                t.Id,
		Name:              t.Name,
		Slug:              t.Slug,
		Description:       t.Description,
		MonthlyPriceCents: t.MonthlyPriceCents,
		YearlyPriceCents:  t.YearlyPriceCents,
		DisplayOrder:      int(t.DisplayOrder),
		IsActive:          t.IsActive,
		IsPublic:          t.IsPublic,
		IsDefault:         t.IsDefault,
		PerSeat:           t.PerSeat,
		Limits: tierLimitsDTO{
			MaxProjects:                limitOr("max_projects", -1),
			MaxCollaboratorsPerProject: limitOr("max_collaborators_per_project", -1),
			BusinessWorkspaces:         limitOr("business_workspaces", 0) == 1,
		},
		FeatureBullets: bullets,
	}
}

func dtoToProtoTier(d *tierDTO) *billingpb.SubscriptionTier {
	bw := int64(0)
	if d.Limits.BusinessWorkspaces {
		bw = 1
	}
	return &billingpb.SubscriptionTier{
		Id:                d.ID,
		Name:              d.Name,
		Slug:              d.Slug,
		Description:       d.Description,
		MonthlyPriceCents: d.MonthlyPriceCents,
		YearlyPriceCents:  d.YearlyPriceCents,
		DisplayOrder:      int32(d.DisplayOrder),
		IsActive:          d.IsActive,
		IsPublic:          d.IsPublic,
		PerSeat:           d.PerSeat,
		Limits: map[string]int64{
			"max_projects":                  d.Limits.MaxProjects,
			"max_collaborators_per_project": d.Limits.MaxCollaboratorsPerProject,
			"business_workspaces":           bw,
		},
		FeatureBullets: d.FeatureBullets,
	}
}

// GetTiers returns every tier (incl. inactive) for the admin editor. Falls back
// to an empty list if the billing service is unreachable so the UI stays usable.
func (h *BillingHandler) GetTiers(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []tierDTO]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]tierDTO, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			resp, err := h.client.ListAllTiers(ctx, &billingpb.ListAllTiersRequest{})
			if err != nil {
				log.Printf("GetTiers: billing service error: %v", err)
				empty := make([]tierDTO, 0)
				return &empty, nil
			}
			out := make([]tierDTO, 0, len(resp.Tiers))
			for _, t := range resp.Tiers {
				out = append(out, protoTierToDTO(t))
			}
			return &out, nil
		},
	}.ServeHTTP(w, r)
}

// GetTier returns a single tier by id (sourced from the full admin list).
func (h *BillingHandler) GetTier(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, tierDTO]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*tierDTO, error) {
			id := chi.URLParam(r, "id")
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			resp, err := h.client.ListAllTiers(ctx, &billingpb.ListAllTiersRequest{})
			if err != nil {
				return nil, err
			}
			for _, t := range resp.Tiers {
				if t.Id == id {
					dto := protoTierToDTO(t)
					return &dto, nil
				}
			}
			return nil, apierror.New(apierror.CodeNotFound, http.StatusNotFound, "tier not found")
		},
	}.ServeHTTP(w, r)
}

// CreateTier creates a subscription tier.
func (h *BillingHandler) CreateTier(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[tierDTO, tierDTO]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        handlers.JSONBody[tierDTO],
		SuccessStatus: http.StatusCreated,
		Handle: func(r *http.Request, userID string, in *tierDTO) (*tierDTO, error) {
			if in.Name == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "tier name is required")
			}
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			in.ID = ""
			resp, err := h.client.CreateTier(ctx, &billingpb.CreateTierRequest{Tier: dtoToProtoTier(in)})
			if err != nil {
				return nil, err
			}
			dto := protoTierToDTO(resp.Tier)
			return &dto, nil
		},
	}.ServeHTTP(w, r)
}

// UpdateTier updates a tier (id from the path; client-supplied id in the body is ignored).
func (h *BillingHandler) UpdateTier(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[tierDTO, tierDTO]{
		Method: http.MethodPut,
		Auth:   true,
		Decode: handlers.JSONBody[tierDTO],
		Handle: func(r *http.Request, userID string, in *tierDTO) (*tierDTO, error) {
			in.ID = chi.URLParam(r, "id")
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			resp, err := h.client.UpdateTier(ctx, &billingpb.UpdateTierRequest{Tier: dtoToProtoTier(in)})
			if err != nil {
				return nil, err
			}
			dto := protoTierToDTO(resp.Tier)
			return &dto, nil
		},
	}.ServeHTTP(w, r)
}

// DeleteTier soft-deletes a tier (the default tier is delete-protected by the service).
func (h *BillingHandler) DeleteTier(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			id := chi.URLParam(r, "id")
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			if _, err := h.client.DeleteTier(ctx, &billingpb.DeleteTierRequest{Id: id}); err != nil {
				return nil, err
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// ReorderTiers sets each tier's display_order to its position in the list.
func (h *BillingHandler) ReorderTiers(w http.ResponseWriter, r *http.Request) {
	type reorderBody struct {
		TierIDs []string `json:"tierIds"`
	}
	handlers.Endpoint[reorderBody, struct{}]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        handlers.JSONBody[reorderBody],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, in *reorderBody) (*struct{}, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			if _, err := h.client.ReorderTiers(ctx, &billingpb.ReorderTiersRequest{TierIds: in.TierIDs}); err != nil {
				return nil, err
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// GetAnalytics returns billing KPIs computed by the billing service from live
// subscription data: MRR (monthly recurring revenue, summed across active
// subscriptions with yearly cycles amortised into a monthly equivalent), ARR
// (MRR × 12), churn rate (cancellations in the last 30 days / active count),
// and per-tier distribution + revenue. Falls back to a zeroed response if the
// billing service is unreachable so the admin UI stays rendered.
func (h *BillingHandler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]interface{}, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			resp, err := h.client.GetBillingAnalytics(ctx, &billingpb.GetBillingAnalyticsRequest{})
			if err != nil {
				log.Printf("GetAnalytics: billing service error: %v", err)
				return &map[string]interface{}{
					"mrr":              0,
					"arr":              0,
					"churnRate":        0.0,
					"tierDistribution": []interface{}{},
					"revenueByTier":    []interface{}{},
				}, nil
			}

			type tierEntry struct {
				TierID   string  `json:"tierId"`
				TierName string  `json:"tierName"`
				Count    int64   `json:"count,omitempty"`
				Revenue  float64 `json:"revenue,omitempty"`
			}
			distribution := make([]tierEntry, 0, len(resp.TierDistribution))
			for _, e := range resp.TierDistribution {
				distribution = append(distribution, tierEntry{TierID: e.TierId, TierName: e.TierName, Count: e.Count})
			}
			revenue := make([]tierEntry, 0, len(resp.RevenueByTier))
			for _, e := range resp.RevenueByTier {
				revenue = append(revenue, tierEntry{TierID: e.TierId, TierName: e.TierName, Revenue: e.Revenue})
			}

			return &map[string]interface{}{
				"mrr":              resp.Mrr,
				"arr":              resp.Arr,
				"churnRate":        resp.ChurnRate,
				"tierDistribution": distribution,
				"revenueByTier":    revenue,
			}, nil
		},
	}.ServeHTTP(w, r)
}

// GetGateways returns the list of configured payment gateways. Currently returns
// a single hardcoded Stripe entry in test mode until Stripe keys are configured.
func (h *BillingHandler) GetGateways(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]map[string]interface{}, error) {
			gateways := []map[string]interface{}{
				{
					"id":       "stripe",
					"name":     "Stripe",
					"provider": "stripe",
					"active":   false,
					"testMode": true,
				},
			}
			return &gateways, nil
		},
	}.ServeHTTP(w, r)
}

// GetSubscriptions returns a paginated list of every subscription across all
// users, for the admin subscriptions table. Pagination params (`page`, `limit`)
// and `status` filter arrive as query strings; limit defaults to 50. Returns an
// empty page if the billing service is unreachable so the admin UI stays rendered.
func (h *BillingHandler) GetSubscriptions(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]interface{}, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			q := r.URL.Query()
			page := 1
			limit := 50
			if v := q.Get("page"); v != "" {
				if n, err := strconv.Atoi(v); err == nil && n > 0 {
					page = n
				}
			}
			if v := q.Get("limit"); v != "" {
				if n, err := strconv.Atoi(v); err == nil && n > 0 {
					limit = n
				}
			}
			offset := (page - 1) * limit

			resp, err := h.client.ListAllSubscriptions(ctx, &billingpb.ListAllSubscriptionsRequest{
				Offset:       int32(offset),
				Limit:        int32(limit),
				StatusFilter: q.Get("status"),
			})
			if err != nil {
				log.Printf("GetSubscriptions: billing service error: %v", err)
				return &map[string]interface{}{
					"subscriptions": []interface{}{},
					"total":         0,
					"pages":         0,
				}, nil
			}

			type subOut struct {
				ID     string `json:"id"`
				UserID string `json:"userId"`
				PlanID string `json:"planId"`
				Status string `json:"status"`
			}
			subs := make([]subOut, 0, len(resp.Subscriptions))
			for _, s := range resp.Subscriptions {
				subs = append(subs, subOut{ID: s.Id, UserID: s.UserId, PlanID: s.PlanId, Status: s.Status})
			}
			pages := int(resp.Total) / limit
			if int(resp.Total)%limit != 0 {
				pages++
			}

			return &map[string]interface{}{
				"subscriptions": subs,
				"total":         resp.Total,
				"pages":         pages,
			}, nil
		},
	}.ServeHTTP(w, r)
}

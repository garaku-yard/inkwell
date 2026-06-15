package billing

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"time"

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

// tierOut is the frontend-facing shape of a subscription tier returned by GetTiers.
type tierOut struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Description  string `json:"description"`
	Status       string `json:"status"`
	DisplayOrder int    `json:"displayOrder"`
	Price        struct {
		Monthly  float64 `json:"monthly"`
		Yearly   float64 `json:"yearly"`
		Currency string  `json:"currency"`
	} `json:"price"`
	Limits struct {
		MaxProjects      interface{} `json:"maxProjects"`
		MaxCollaborators interface{} `json:"maxCollaborators"`
		AITokens         interface{} `json:"aiTokens"`
		StorageGB        interface{} `json:"storageGB"`
	} `json:"limits"`
	Features struct {
		AIFeatures           bool     `json:"aiFeatures"`
		CollaborationEnabled bool     `json:"collaborationEnabled"`
		PrioritySupport      bool     `json:"prioritySupport"`
		ExportFormats        []string `json:"exportFormats"`
		AvailableThemes      []string `json:"availableThemes"`
		CustomBranding       bool     `json:"customBranding"`
	} `json:"features"`
	Rules struct {
		LimitType       string `json:"limitType"`
		OverageHandling string `json:"overageHandling"`
	} `json:"rules"`
	GatewayMappings map[string]interface{} `json:"gatewayMappings"`
	CreatedAt       string                 `json:"createdAt"`
	UpdatedAt       string                 `json:"updatedAt"`
}

// GetTiers returns all subscription tiers fetched from the billing service, shaped
// into the frontend's expected format. If the billing service is unreachable it
// returns an empty list rather than an error so the UI degrades gracefully.
// Yearly pricing applies a ~17% discount (10× the monthly price).
func (h *BillingHandler) GetTiers(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []tierOut]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]tierOut, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			resp, err := h.client.GetPlans(ctx, &billingpb.GetPlansRequest{})
			if err != nil {
				log.Printf("GetTiers: billing service error: %v", err)
				// Return empty list — billing service may not be running
				empty := make([]tierOut, 0)
				return &empty, nil
			}

			now := time.Now().Format(time.RFC3339)
			tiers := make([]tierOut, 0, len(resp.Plans))
			for i, plan := range resp.Plans {
				t := tierOut{}
				t.ID = plan.Id
				t.Name = plan.Name
				t.Slug = plan.Id
				t.Description = plan.Description
				t.Status = "active"
				t.DisplayOrder = i
				t.Price.Monthly = float64(plan.PriceCents) / 100
				t.Price.Yearly = float64(plan.PriceCents) / 100 * 10 // ~2 months free
				t.Price.Currency = plan.Currency
				if plan.MaxProjects == 0 {
					t.Limits.MaxProjects = "unlimited"
				} else {
					t.Limits.MaxProjects = int(plan.MaxProjects)
				}
				if plan.MaxCollaboratorsPerProject == 0 {
					t.Limits.MaxCollaborators = "unlimited"
				} else {
					t.Limits.MaxCollaborators = int(plan.MaxCollaboratorsPerProject)
				}
				t.Limits.AITokens = "unlimited"
				t.Limits.StorageGB = "unlimited"
				t.Features.AIFeatures = plan.AiFeaturesEnabled
				t.Features.CollaborationEnabled = true
				t.Features.PrioritySupport = plan.PrioritySupport
				t.Features.ExportFormats = []string{"pdf", "fdx"}
				t.Features.AvailableThemes = []string{"default", "dark"}
				t.Features.CustomBranding = false
				t.Rules.LimitType = "soft"
				t.Rules.OverageHandling = "block"
				t.GatewayMappings = map[string]interface{}{}
				t.CreatedAt = now
				t.UpdatedAt = now
				tiers = append(tiers, t)
			}

			return &tiers, nil
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

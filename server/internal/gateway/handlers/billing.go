package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"inkwell/server/internal/gateway/grpcclient"
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

// GetTiers returns all subscription tiers fetched from the billing service, shaped
// into the frontend's expected format. If the billing service is unreachable it
// returns an empty list rather than an error so the UI degrades gracefully.
// Yearly pricing applies a ~17% discount (10× the monthly price).
func (h *BillingHandler) GetTiers(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.client.GetPlans(ctx, &billingpb.GetPlansRequest{})
	if err != nil {
		log.Printf("GetTiers: billing service error: %v", err)
		// Return empty list — billing service may not be running
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]interface{}{})
		return
	}

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
			AIFeatures            bool     `json:"aiFeatures"`
			CollaborationEnabled  bool     `json:"collaborationEnabled"`
			PrioritySupport       bool     `json:"prioritySupport"`
			ExportFormats         []string `json:"exportFormats"`
			AvailableThemes       []string `json:"availableThemes"`
			CustomBranding        bool     `json:"customBranding"`
		} `json:"features"`
		Rules struct {
			LimitType       string `json:"limitType"`
			OverageHandling string `json:"overageHandling"`
		} `json:"rules"`
		GatewayMappings map[string]interface{} `json:"gatewayMappings"`
		CreatedAt       string                 `json:"createdAt"`
		UpdatedAt       string                 `json:"updatedAt"`
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tiers)
}

// GetAnalytics returns billing analytics. Currently returns zeroed metrics (MRR,
// ARR, churn rate) until a payment processor is configured.
func (h *BillingHandler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	analytics := map[string]interface{}{
		"mrr":       0,
		"arr":       0,
		"churnRate": 0.0,
		"tierDistribution": []interface{}{},
		"revenueByTier":    []interface{}{},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analytics)
}

// GetGateways returns the list of configured payment gateways. Currently returns
// a single hardcoded Stripe entry in test mode until Stripe keys are configured.
func (h *BillingHandler) GetGateways(w http.ResponseWriter, r *http.Request) {
	gateways := []map[string]interface{}{
		{
			"id":       "stripe",
			"name":     "Stripe",
			"provider": "stripe",
			"active":   false,
			"testMode": true,
		},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gateways)
}

// GetSubscriptions returns a paginated list of user subscriptions. Currently returns
// an empty list until subscription management is fully implemented.
func (h *BillingHandler) GetSubscriptions(w http.ResponseWriter, r *http.Request) {
	result := map[string]interface{}{
		"subscriptions": []interface{}{},
		"total":         0,
		"pages":         0,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

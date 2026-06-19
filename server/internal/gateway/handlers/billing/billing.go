package billing

import (
	"context"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

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

// myBillingDTO is the current user's own billing state, used by the Settings
// Account badge and Billing section. It always resolves a tier (the default Free
// tier when the user has no subscription), so the UI never has to special-case a
// missing plan. Status is the subscription lifecycle ("active", "trialing",
// "canceled", "past_due") or "none" for the default free tier.
type myBillingDTO struct {
	TierID                     string `json:"tierId"`
	TierName                   string `json:"tierName"`
	PriceCents                 int64  `json:"priceCents"`
	Status                     string `json:"status"`
	CurrentPeriodEnd           string `json:"currentPeriodEnd,omitempty"`
	MaxProjects                int64  `json:"maxProjects"`                // -1 means unlimited (matches tierDTO)
	MaxCollaboratorsPerProject int64  `json:"maxCollaboratorsPerProject"` // -1 means unlimited
	AIFeaturesEnabled          bool   `json:"aiFeaturesEnabled"`
	PrioritySupport            bool   `json:"prioritySupport"`
}

// unlimitedNeg normalises a Plan cap to the client's convention: the Plan proto
// leaves an unlimited cap at its 0 zero value, but the rest of the billing UI
// treats -1 as unlimited. Map any non-positive cap to -1.
func unlimitedNeg(v int32) int64 {
	if v <= 0 {
		return -1
	}
	return int64(v)
}

// GetMyBilling returns the authenticated user's effective tier and subscription
// status. The tier comes from GetEffectiveTier (which falls back to the default
// Free tier when there is no active subscription); subscription status and period
// are enriched best-effort from GetUserSubscription, which errors for free users
// with no row — that's treated as status "none", not a failure.
func (h *BillingHandler) GetMyBilling(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, myBillingDTO]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*myBillingDTO, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			tierResp, err := h.client.GetEffectiveTier(ctx, &billingpb.GetEffectiveTierRequest{UserId: userID})
			if err != nil || tierResp.GetPlan() == nil {
				log.Printf("GetMyBilling: effective tier error: %v", err)
				// Always render something sane rather than failing the page.
				return &myBillingDTO{TierName: "Free", Status: "none"}, nil
			}
			plan := tierResp.GetPlan()
			out := myBillingDTO{
				TierID:                     plan.GetId(),
				TierName:                   plan.GetName(),
				PriceCents:                 plan.GetPriceCents(),
				Status:                     "none",
				MaxProjects:                unlimitedNeg(plan.GetMaxProjects()),
				MaxCollaboratorsPerProject: unlimitedNeg(plan.GetMaxCollaboratorsPerProject()),
				AIFeaturesEnabled:          plan.GetAiFeaturesEnabled(),
				PrioritySupport:            plan.GetPrioritySupport(),
			}

			// Enrich with live subscription status/period when one exists. A
			// missing subscription (free user) errors here — that's expected.
			if subResp, subErr := h.client.GetUserSubscription(ctx, &billingpb.GetUserSubscriptionRequest{UserId: userID}); subErr == nil && subResp.GetSubscription() != nil {
				sub := subResp.GetSubscription()
				out.Status = sub.GetStatus()
				out.CurrentPeriodEnd = handlers.TimestampToString(sub.GetCurrentPeriodEnd())
			}
			return &out, nil
		},
	}.ServeHTTP(w, r)
}

// GetPublicTiers returns the active, public tiers for the Settings → Billing
// plan comparison, lowest display order first. Unlike the admin GetTiers it hides
// inactive and non-public tiers. Falls back to an empty list if the billing
// service is unreachable so the page stays usable.
func (h *BillingHandler) GetPublicTiers(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []tierDTO]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]tierDTO, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			resp, err := h.client.ListAllTiers(ctx, &billingpb.ListAllTiersRequest{})
			if err != nil {
				log.Printf("GetPublicTiers: billing service error: %v", err)
				empty := make([]tierDTO, 0)
				return &empty, nil
			}
			out := make([]tierDTO, 0, len(resp.Tiers))
			for _, t := range resp.Tiers {
				if !t.IsActive || !t.IsPublic {
					continue
				}
				out = append(out, protoTierToDTO(t))
			}
			return &out, nil
		},
	}.ServeHTTP(w, r)
}

// checkoutBody is the request shape for CreateCheckout.
type checkoutBody struct {
	TierID string `json:"tierId"`
}

// checkoutResponse carries the hosted checkout link the client redirects to.
type checkoutResponse struct {
	CheckoutURL string `json:"checkoutUrl"`
}

// CreateCheckout starts a paid upgrade: it asks the billing service for a hosted
// checkout link for the chosen tier. When no payment gateway is configured the
// billing service returns FailedPrecondition (HTTP 422), which the client treats
// as "checkout not available yet".
func (h *BillingHandler) CreateCheckout(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[checkoutBody, checkoutResponse]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: handlers.JSONBody[checkoutBody],
		Handle: func(r *http.Request, userID string, req *checkoutBody) (*checkoutResponse, error) {
			if req.TierID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "tierId is required")
			}
			ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
			defer cancel()
			resp, err := h.client.CreateCheckout(ctx, &billingpb.CreateCheckoutRequest{
				UserId: userID,
				TierId: req.TierID,
			})
			if err != nil {
				return nil, err
			}
			return &checkoutResponse{CheckoutURL: resp.CheckoutUrl}, nil
		},
	}.ServeHTTP(w, r)
}

// PaddleWebhook receives Paddle's subscription webhooks. It is mounted OUTSIDE
// the auth group — Paddle authenticates by signing the body, not with a session.
// The raw bytes are forwarded verbatim to the billing service, which verifies the
// HMAC and mirrors the subscription. A verified-but-failed apply returns 5xx so
// Paddle retries; a bad signature returns 4xx so it does not.
func (h *BillingHandler) PaddleWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MiB cap
	if err != nil {
		http.Error(w, "cannot read body", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if _, err := h.client.ProcessWebhook(ctx, &billingpb.ProcessWebhookRequest{
		Provider:  "paddle",
		Signature: r.Header.Get("Paddle-Signature"),
		Payload:   body,
	}); err != nil {
		log.Printf("PaddleWebhook rejected: %v", err)
		// Internal errors are transient (DB, etc.) → 5xx so Paddle retries.
		// Everything else (bad signature, not configured) → 4xx, no retry value.
		if status.Code(err) == codes.Internal {
			http.Error(w, "webhook processing error", http.StatusInternalServerError)
		} else {
			http.Error(w, "webhook rejected", http.StatusBadRequest)
		}
		return
	}
	w.WriteHeader(http.StatusOK)
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
// gatewayDTO is the admin gateways-list shape. provider is the stable gateway
// key the front-end switches on; id is the internal UUID.
type gatewayDTO struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Provider string `json:"provider"`
	Active   bool   `json:"active"`
	TestMode bool   `json:"testMode"`
}

func (h *BillingHandler) GetGateways(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []gatewayDTO]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]gatewayDTO, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			resp, err := h.client.ListGateways(ctx, &billingpb.ListGatewaysRequest{})
			if err != nil {
				log.Printf("GetGateways: billing service error: %v", err)
				empty := make([]gatewayDTO, 0)
				return &empty, nil
			}
			out := make([]gatewayDTO, 0, len(resp.Gateways))
			for _, g := range resp.Gateways {
				out = append(out, gatewayDTO{
					ID:       g.Id,
					Name:     g.Name,
					Provider: g.GatewayId,
					Active:   g.Active,
					TestMode: g.TestMode,
				})
			}
			return &out, nil
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

package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"inkwell/server/internal/gateway/config"
	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
	"inkwell/server/pkg/aiadapter"
	aisettingspb "inkwell/server/pkg/grpc/aisettings"
	billingpb "inkwell/server/pkg/grpc/billing"
)

// managedPrefix marks a providerId as a managed (Inkwell-keyed) provider rather
// than a BYO ai-settings row, e.g. "managed:openai".
const managedPrefix = "managed:"

// metricAITokens is the usage metric accumulated per managed-AI dispatch — the
// provider-reported total token count, the basis for managed allowance caps.
const metricAITokens = "ai_tokens"

// AIHandler serves the AI chat endpoint. A request either names a BYO
// `providerId` that resolves to a row in the ai-settings service, or a
// "managed:<kind>" provider dispatched with Inkwell's own keys. BYO chats are
// ungated; managed chats are metered and capped against the user's tier.
type AIHandler struct {
	aiSettings            aisettingspb.AISettingsServiceClient
	billing               billingpb.BillingServiceClient
	openAICompatibleHosts []string
	managedProviders      map[string]config.ManagedAIProvider
}

// NewAIHandler wires the chat handler to the ai-settings + billing gRPC clients,
// the operator-supplied openai_compatible host allowlist, and the managed AI
// provider keys. The clients registry is taken as input instead of assembled
// locally so test doubles can be injected.
func NewAIHandler(cfg *config.Config, clients *grpcclient.Registry) (*AIHandler, error) {
	return &AIHandler{
		aiSettings:            clients.AISettings,
		billing:               clients.Billing,
		openAICompatibleHosts: cfg.OpenAICompatibleHosts,
		managedProviders:      cfg.ManagedAIProviders,
	}, nil
}

// ManagedProviders lists the managed AI providers this deployment offers, so the
// client can present them alongside BYO rows. Empty when managed AI is not
// configured.
func (h *AIHandler) ManagedProviders(w http.ResponseWriter, r *http.Request) {
	type managedDTO struct {
		ProviderID   string `json:"providerId"` // "managed:openai"
		Kind         string `json:"kind"`
		DefaultModel string `json:"defaultModel"`
	}
	out := make([]managedDTO, 0, len(h.managedProviders))
	for kind, p := range h.managedProviders {
		out = append(out, managedDTO{ProviderID: managedPrefix + kind, Kind: kind, DefaultModel: p.DefaultModel})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// ChatRequest carries the conversation history and the BYO provider
// row id the chat should dispatch through.
type ChatRequest struct {
	Messages   []ChatMessage `json:"messages"`
	ProviderID string        `json:"providerId"`
	Model      string        `json:"model,omitempty"`
	Stream     bool          `json:"stream,omitempty"`
}

// ChatMessage is one turn in a chat. Roles are "system" | "user" | "assistant".
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Chat resolves the user-configured provider, fetches the decrypted key
// via ai-settings, and dispatches through the aiadapter package. The
// response is streamed back as NDJSON (`{"response":"..."}` per chunk,
// terminating with `{"done":true}`) so the existing client parser stays
// unchanged.
func (h *AIHandler) Chat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		handlers.WriteError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		handlers.WriteError(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}
	if req.ProviderID == "" {
		handlers.WriteError(w, "providerId is required", http.StatusBadRequest)
		return
	}

	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		handlers.WriteError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Resolve the dispatch parameters from either a managed provider (Inkwell's
	// keys, metered + capped) or a BYO ai-settings row (ungated).
	var (
		kind, apiKey, model, baseURL string
		managed                      bool
	)
	if strings.HasPrefix(req.ProviderID, managedPrefix) {
		managed = true
		mkind := strings.TrimPrefix(req.ProviderID, managedPrefix)
		mp, ok := h.managedProviders[mkind]
		if !ok {
			handlers.WriteError(w, "Managed AI is not available for this provider", http.StatusBadRequest)
			return
		}
		// Enforce the tier's monthly managed-AI allowance before dispatching on
		// Inkwell's key.
		if msg, over := h.overManagedQuota(r.Context(), userID); over {
			handlers.WriteError(w, msg, http.StatusTooManyRequests)
			return
		}
		kind, apiKey = mkind, mp.APIKey
		model = req.Model
		if model == "" {
			model = mp.DefaultModel
		}
	} else {
		disp, err := h.aiSettings.GetForDispatch(r.Context(), &aisettingspb.GetForDispatchRequest{
			UserId: userID,
			Id:     req.ProviderID,
		})
		if err != nil {
			handlers.HandleGRPCError(w, err)
			return
		}
		setting := disp.Setting
		if !setting.Enabled {
			handlers.WriteError(w, fmt.Sprintf("AI provider %q is disabled", setting.Label), http.StatusBadRequest)
			return
		}
		kind, apiKey, baseURL = setting.Kind, disp.ApiKey, setting.BaseUrl
		model = req.Model
		if model == "" {
			model = setting.DefaultModel
		}
		// Re-check the openai_compatible allowlist at dispatch time — defense in
		// depth in case the row was created when a wider list was configured.
		if setting.Kind == string(aiadapter.KindOpenAICompatible) {
			if err := handlers.ValidateOpenAICompatibleURL(setting.BaseUrl, h.openAICompatibleHosts); err != nil {
				handlers.WriteError(w, err.Error(), http.StatusBadRequest)
				return
			}
		}
	}

	if model == "" {
		handlers.WriteError(w, "model required (no default set for provider)", http.StatusBadRequest)
		return
	}

	adapter, err := aiadapter.Get(aiadapter.ProviderKind(kind))
	if err != nil {
		handlers.WriteError(w, fmt.Sprintf("Provider kind %q not supported on this build", kind), http.StatusBadRequest)
		return
	}

	messages := make([]aiadapter.Message, len(req.Messages))
	for i, m := range req.Messages {
		messages[i] = aiadapter.Message{Role: m.Role, Content: m.Content}
	}

	stream, err := adapter.StreamChat(r.Context(), aiadapter.Input{
		Messages: messages,
		Model:    model,
		APIKey:   apiKey,
		BaseURL:  baseURL,
	})
	if err != nil {
		log.Printf("ai dispatch error (kind=%s): %v", kind, err)
		handlers.WriteError(w, "Provider rejected the request", providerHTTPStatus(err))
		return
	}
	defer stream.Close()

	flusher, ok := w.(http.Flusher)
	if !ok {
		handlers.WriteError(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Transfer-Encoding", "chunked")
	w.WriteHeader(http.StatusOK)

	encoder := json.NewEncoder(w)
	for {
		chunk, err := stream.Next(r.Context())
		if errors.Is(err, io.EOF) {
			return
		}
		if err != nil {
			// Headers are already flushed (200 OK), so we can't change
			// the status. Surface the failure as a final NDJSON line
			// the client parser is expecting on this stream — without
			// it, an aborted upstream looks identical to a successful
			// short reply.
			log.Printf("ai stream error: %v", err)
			_ = encoder.Encode(map[string]string{"error": redactStreamError(err)})
			flusher.Flush()
			return
		}
		if chunk.Delta != "" {
			_ = encoder.Encode(map[string]string{"response": chunk.Delta})
			flusher.Flush()
		}
		if chunk.Done {
			// Meter managed usage by the provider-reported token total. Best-effort
			// and only when the provider supplied usage (some endpoints omit it).
			if managed && chunk.Usage != nil && chunk.Usage.TotalTokens > 0 {
				h.trackManagedTokens(userID, chunk.Usage.TotalTokens)
			}
			_ = encoder.Encode(map[string]bool{"done": true})
			flusher.Flush()
			return
		}
	}
}

// overManagedQuota reports whether the user has exhausted their tier's monthly
// managed-AI allowance. It fails OPEN on any billing error (a billing blip must
// not break chat) and treats a non-positive cap as unlimited; it only blocks on
// a definitive over-limit. Returns a user-facing message and true when over.
func (h *AIHandler) overManagedQuota(ctx context.Context, userID string) (string, bool) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	tierResp, err := h.billing.GetEffectiveTier(ctx, &billingpb.GetEffectiveTierRequest{UserId: userID})
	if err != nil || tierResp.GetPlan() == nil {
		return "", false
	}
	cap := tierResp.GetPlan().GetAiTokensPerMonth()
	if cap <= 0 {
		return "", false // unlimited
	}
	usage, err := h.billing.GetMonthlyUsage(ctx, &billingpb.GetMonthlyUsageRequest{UserId: userID, Metric: metricAITokens})
	if err != nil {
		return "", false
	}
	if usage.GetUsed() >= cap {
		return fmt.Sprintf("You've used your monthly managed AI allowance (%d tokens). Upgrade your plan or use your own provider key.", cap), true
	}
	return "", false
}

// trackManagedTokens records a managed-AI dispatch's token total against the
// user's monthly usage. Best-effort with its own timeout so it survives the
// request ending.
func (h *AIHandler) trackManagedTokens(userID string, tokens int) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := h.billing.TrackUsage(ctx, &billingpb.TrackUsageRequest{
		UserId:     userID,
		MetricName: metricAITokens,
		Quantity:   int64(tokens),
	}); err != nil {
		log.Printf("ai: track managed tokens for %s: %v", userID, err)
	}
}

// redactStreamError prepares an aiadapter error for the wire. Provider
// payloads are already redacted by aiadapter.redact (so Bearer tokens
// don't leak), but the error string still includes the kind prefix
// which is fine to surface — it tells the user which provider failed.
func redactStreamError(err error) string {
	var perr *aiadapter.ErrProvider
	if errors.As(err, &perr) {
		return perr.Error()
	}
	return "stream interrupted"
}

// providerHTTPStatus maps a provider-layer error onto an HTTP status so
// the client sees e.g. 401 when a saved key was revoked.
func providerHTTPStatus(err error) int {
	var perr *aiadapter.ErrProvider
	if !errors.As(err, &perr) {
		return http.StatusBadGateway
	}
	switch {
	case perr.Status >= 400 && perr.Status < 500:
		return perr.Status
	case perr.Status >= 500:
		return http.StatusBadGateway
	default:
		return http.StatusBadGateway
	}
}

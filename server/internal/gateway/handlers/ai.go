package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"

	"inkwell/server/internal/gateway/config"
	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/pkg/aiadapter"
	aisettingspb "inkwell/server/pkg/grpc/aisettings"
)

// AIHandler serves the AI chat endpoint. Every request must name a
// `providerId` that resolves to a row in the ai-settings service; the
// handler fetches the decrypted key, picks the matching adapter from
// `pkg/aiadapter`, and streams the provider's response back as NDJSON.
type AIHandler struct {
	aiSettings            aisettingspb.AISettingsServiceClient
	openAICompatibleHosts []string
}

// NewAIHandler wires the chat handler to the ai-settings gRPC client and
// the operator-supplied openai_compatible host allowlist. The clients
// registry is taken as input instead of assembled locally so test
// doubles can be injected.
func NewAIHandler(cfg *config.Config, clients *grpcclient.Registry) (*AIHandler, error) {
	return &AIHandler{
		aiSettings:            clients.AISettings,
		openAICompatibleHosts: cfg.OpenAICompatibleHosts,
	}, nil
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}
	if req.ProviderID == "" {
		writeError(w, "providerId is required", http.StatusBadRequest)
		return
	}

	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	disp, err := h.aiSettings.GetForDispatch(r.Context(), &aisettingspb.GetForDispatchRequest{
		UserId: userID,
		Id:     req.ProviderID,
	})
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	setting := disp.Setting
	if !setting.Enabled {
		writeError(w, fmt.Sprintf("AI provider %q is disabled", setting.Label), http.StatusBadRequest)
		return
	}

	model := req.Model
	if model == "" {
		model = setting.DefaultModel
	}
	if model == "" {
		writeError(w, "model required (no default set for provider)", http.StatusBadRequest)
		return
	}

	adapter, err := aiadapter.Get(aiadapter.ProviderKind(setting.Kind))
	if err != nil {
		writeError(w, fmt.Sprintf("Provider kind %q not supported on this build", setting.Kind), http.StatusBadRequest)
		return
	}

	// Re-check the openai_compatible allowlist at dispatch time —
	// defense in depth in case the row was created when a wider list
	// was configured. Other kinds skip this check.
	if setting.Kind == string(aiadapter.KindOpenAICompatible) {
		if err := validateOpenAICompatibleURL(setting.BaseUrl, h.openAICompatibleHosts); err != nil {
			writeError(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	messages := make([]aiadapter.Message, len(req.Messages))
	for i, m := range req.Messages {
		messages[i] = aiadapter.Message{Role: m.Role, Content: m.Content}
	}

	stream, err := adapter.StreamChat(r.Context(), aiadapter.Input{
		Messages: messages,
		Model:    model,
		APIKey:   disp.ApiKey,
		BaseURL:  setting.BaseUrl,
	})
	if err != nil {
		log.Printf("ai dispatch error (kind=%s): %v", setting.Kind, err)
		writeError(w, "Provider rejected the request", providerHTTPStatus(err))
		return
	}
	defer stream.Close()

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, "Streaming unsupported", http.StatusInternalServerError)
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
			log.Printf("ai stream error: %v", err)
			return
		}
		if chunk.Delta != "" {
			_ = encoder.Encode(map[string]string{"response": chunk.Delta})
			flusher.Flush()
		}
		if chunk.Done {
			_ = encoder.Encode(map[string]bool{"done": true})
			flusher.Flush()
			return
		}
	}
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

package handlers

import (
	"bytes"
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

// AIHandler serves AI endpoints on the gateway. It covers two dispatch
// paths:
//
//  1. BYO: when the request names a `providerId` the user has configured,
//     the handler fetches the decrypted key from ai-settings and calls
//     the provider directly via the aiadapter package. Keys never reach
//     the client or the Python service.
//  2. Legacy: when no providerId is given, the request is proxied to the
//     Python AI service using server-managed keys (the current hosted
//     default).
type AIHandler struct {
	aiChatServiceURL      string
	aiSettings            aisettingspb.AISettingsServiceClient
	openAICompatibleHosts []string
}

// NewAIHandler creates an AIHandler with both the Python proxy URL and
// the ai-settings gRPC client. The clients registry is taken as input
// instead of assembled locally so test doubles can be injected.
func NewAIHandler(cfg *config.Config, clients *grpcclient.Registry) (*AIHandler, error) {
	return &AIHandler{
		aiChatServiceURL:      fmt.Sprintf("http://%s:%s", cfg.AIChatService.Host, cfg.AIChatService.Port),
		aiSettings:            clients.AISettings,
		openAICompatibleHosts: cfg.OpenAICompatibleHosts,
	}, nil
}

// ChatRequest carries the conversation history and optional provider
// selection. Either `provider` (legacy kind string) or `providerId` (BYO
// row id) may be set.
type ChatRequest struct {
	Messages   []ChatMessage `json:"messages"`
	Provider   string        `json:"provider,omitempty"`
	ProviderID string        `json:"providerId,omitempty"`
	Model      string        `json:"model,omitempty"`
	Stream     bool          `json:"stream,omitempty"`
}

// ChatMessage is one turn in a chat. Roles are "system" | "user" | "assistant".
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ProvidersResponse matches the legacy Python AI service response.
type ProvidersResponse struct {
	Providers []string                          `json:"providers"`
	Config    map[string]map[string]interface{} `json:"config"`
}

// Chat routes to the BYO path when `providerId` is set; otherwise falls
// through to the legacy Python proxy.
func (h *AIHandler) Chat(w http.ResponseWriter, r *http.Request) {
	// Preflight is handled by the global CORS middleware (router-level).
	// Emitting our own ACAO=* here would contradict the allowlist and
	// break credentialed requests.
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req ChatRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	if req.ProviderID != "" {
		h.chatBYO(w, r, &req)
		return
	}
	h.chatProxy(w, r, body)
}

// chatBYO resolves a user-configured provider, fetches the decrypted key
// via ai-settings, and dispatches through the aiadapter package. The
// response is streamed back as NDJSON (`{"response":"..."}` per chunk,
// terminating with `{"done":true}`) so the existing client parser stays
// unchanged.
func (h *AIHandler) chatBYO(w http.ResponseWriter, r *http.Request, req *ChatRequest) {
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

// chatProxy is the legacy Python passthrough. Kept intact so the hosted
// server-managed-keys tier keeps working alongside BYO.
func (h *AIHandler) chatProxy(w http.ResponseWriter, r *http.Request, body []byte) {
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, h.aiChatServiceURL+"/chat", bytes.NewReader(body))
	if err != nil {
		writeError(w, "Failed to create request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	for name, values := range r.Header {
		if name == "Host" || name == "Content-Length" {
			continue
		}
		for _, v := range values {
			req.Header.Add(name, v)
		}
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		writeError(w, "Failed to connect to AI service", http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Transfer-Encoding", "chunked")
	w.WriteHeader(resp.StatusCode)

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}
	buf := make([]byte, 1024)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			_, _ = w.Write(buf[:n])
			flusher.Flush()
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("error streaming AI response: %v", err)
			break
		}
	}
}

// GetProviders proxies the legacy `/providers` endpoint. Unchanged.
func (h *AIHandler) GetProviders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	resp, err := http.Get(h.aiChatServiceURL + "/providers")
	if err != nil {
		writeError(w, "Failed to connect to AI service", http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeError(w, "Failed to read AI service response", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
}

// Health proxies the legacy health check. Unchanged.
func (h *AIHandler) Health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	resp, err := http.Get(h.aiChatServiceURL + "/health")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"status":"error","error":"AI service unavailable"}`))
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"status":"error","error":"Failed to read AI service response"}`))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
}


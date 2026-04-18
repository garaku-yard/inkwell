package handlers

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"inkwell/server/internal/gateway/config"
)

// AIHandler proxies HTTP requests to the Python AI chat service. Rather than
// implementing AI logic directly, the gateway forwards requests over plain HTTP
// and streams responses back to the client.
type AIHandler struct {
	aiChatServiceURL string
}

// NewAIHandler creates an AIHandler that forwards requests to the AI chat
// service address configured in cfg.
func NewAIHandler(cfg *config.Config) (*AIHandler, error) {
	aiChatServiceURL := fmt.Sprintf("http://%s:%s", cfg.AIChatService.Host, cfg.AIChatService.Port)

	return &AIHandler{
		aiChatServiceURL: aiChatServiceURL,
	}, nil
}

// ChatRequest carries the conversation history and optional model preferences
// for a single AI chat turn.
type ChatRequest struct {
	Messages []ChatMessage `json:"messages"`
	Provider string        `json:"provider,omitempty"`
	Model    string        `json:"model,omitempty"`
	Stream   bool          `json:"stream,omitempty"`
}

// ChatMessage represents a single turn in a conversation, identified by role
// ("user", "assistant", or "system") and its text content.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ProvidersResponse describes the AI providers available in the chat service
// and their per-provider configuration.
type ProvidersResponse struct {
	Providers []string                          `json:"providers"`
	Config    map[string]map[string]interface{} `json:"config"`
}

// Chat proxies a streaming AI chat request to the Python AI service and streams
// the NDJSON response back to the caller using chunked transfer encoding. CORS
// preflight OPTIONS requests are handled inline. Returns 503 if the AI service
// is unreachable.
func (h *AIHandler) Chat(w http.ResponseWriter, r *http.Request) {
	// Handle preflight CORS requests
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Read and parse request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Forward the request to the AI chat service
	req, err := http.NewRequest(http.MethodPost, h.aiChatServiceURL+"/chat", strings.NewReader(string(body)))
	if err != nil {
		writeError(w, "Failed to create request", http.StatusInternalServerError)
		return
	}

	// Copy headers
	req.Header.Set("Content-Type", "application/json")
	for name, values := range r.Header {
		if name != "Host" && name != "Content-Length" {
			for _, value := range values {
				req.Header.Add(name, value)
			}
		}
	}

	// Make the request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		writeError(w, "Failed to connect to AI service", http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	// Set response headers for streaming
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Transfer-Encoding", "chunked")

	// Copy status code
	w.WriteHeader(resp.StatusCode)

	// Check if response supports flushing
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Stream the response with immediate flushing
	buffer := make([]byte, 1024)
	for {
		n, err := resp.Body.Read(buffer)
		if n > 0 {
			w.Write(buffer[:n])
			flusher.Flush() // Immediately flush each chunk
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

// GetProviders proxies a request to the AI service's /providers endpoint and
// returns the list of available AI providers (e.g. OpenAI, Anthropic) along
// with their configuration.
func (h *AIHandler) GetProviders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Make request to AI chat service
	resp, err := http.Get(h.aiChatServiceURL + "/providers")
	if err != nil {
		writeError(w, "Failed to connect to AI service", http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeError(w, "Failed to read AI service response", http.StatusInternalServerError)
		return
	}

	// Set response headers
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)

	// Forward the response
	w.Write(body)
}

// Health proxies a health check to the AI chat service and returns its status.
// Returns 503 with a JSON error body if the AI service is unreachable.
func (h *AIHandler) Health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Make request to AI chat service
	resp, err := http.Get(h.aiChatServiceURL + "/health")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"status":"error","error":"AI service unavailable"}`))
		return
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"status":"error","error":"Failed to read AI service response"}`))
		return
	}

	// Set response headers
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)

	// Forward the response
	w.Write(body)
}

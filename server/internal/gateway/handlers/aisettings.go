// Package handlers — AI settings CRUD + key management.
//
// These endpoints are the control surface for the hosted BYO path: users
// manage their provider rows (OpenAI / Anthropic / Gemini) through the
// gateway, the gateway defers to the ai-settings microservice which
// handles Postgres I/O and AES-256-GCM encryption of the API key. The
// plaintext key never crosses this boundary on the way out — it's only
// decrypted inside ai-settings for dispatch.
package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	aisettingspb "inkwell/server/pkg/grpc/aisettings"
)

// AISettingsHandler handles `/api/ai/settings` CRUD + key endpoints.
type AISettingsHandler struct {
	client aisettingspb.AISettingsServiceClient
}

// NewAISettingsHandler wires the HTTP layer to the AI settings gRPC client.
func NewAISettingsHandler(clients *grpcclient.Registry) *AISettingsHandler {
	return &AISettingsHandler{client: clients.AISettings}
}

// ── DTOs ────────────────────────────────────────────────────────────────────

type settingDTO struct {
	ID           string `json:"id"`
	Kind         string `json:"kind"`
	Label        string `json:"label"`
	Enabled      bool   `json:"enabled"`
	BaseURL      string `json:"baseUrl,omitempty"`
	DefaultModel string `json:"defaultModel,omitempty"`
	HasKey       bool   `json:"hasKey"`
}

type saveInputDTO struct {
	Kind         string `json:"kind"`
	Label        string `json:"label"`
	Enabled      bool   `json:"enabled"`
	BaseURL      string `json:"baseUrl,omitempty"`
	DefaultModel string `json:"defaultModel,omitempty"`
}

type setKeyDTO struct {
	APIKey string `json:"apiKey"`
}

func toDTO(s *aisettingspb.ProviderSetting) settingDTO {
	return settingDTO{
		ID:           s.Id,
		Kind:         s.Kind,
		Label:        s.Label,
		Enabled:      s.Enabled,
		BaseURL:      s.BaseUrl,
		DefaultModel: s.DefaultModel,
		HasKey:       s.HasKey,
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// ── Endpoints ───────────────────────────────────────────────────────────────

// List handles GET /api/ai/settings.
func (h *AISettingsHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	resp, err := h.client.ListProviderSettings(r.Context(), &aisettingspb.ListProviderSettingsRequest{UserId: userID})
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	out := make([]settingDTO, len(resp.Settings))
	for i, s := range resp.Settings {
		out[i] = toDTO(s)
	}
	writeJSON(w, http.StatusOK, out)
}

// Create handles POST /api/ai/settings.
func (h *AISettingsHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var in saveInputDTO
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}
	resp, err := h.client.CreateProviderSetting(r.Context(), &aisettingspb.CreateProviderSettingRequest{
		UserId:       userID,
		Kind:         in.Kind,
		Label:        in.Label,
		Enabled:      in.Enabled,
		BaseUrl:      in.BaseURL,
		DefaultModel: in.DefaultModel,
	})
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDTO(resp.Setting))
}

// Update handles PUT /api/ai/settings/{id}.
func (h *AISettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	var in saveInputDTO
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}
	resp, err := h.client.UpdateProviderSetting(r.Context(), &aisettingspb.UpdateProviderSettingRequest{
		UserId:       userID,
		Id:           id,
		Kind:         in.Kind,
		Label:        in.Label,
		Enabled:      in.Enabled,
		BaseUrl:      in.BaseURL,
		DefaultModel: in.DefaultModel,
	})
	if err != nil {
		handleGRPCError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toDTO(resp.Setting))
}

// Delete handles DELETE /api/ai/settings/{id}.
func (h *AISettingsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	if _, err := h.client.DeleteProviderSetting(r.Context(), &aisettingspb.DeleteProviderSettingRequest{
		UserId: userID,
		Id:     id,
	}); err != nil {
		handleGRPCError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SetKey handles POST /api/ai/settings/{id}/key.
func (h *AISettingsHandler) SetKey(w http.ResponseWriter, r *http.Request) {
	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	var in setKeyDTO
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}
	if in.APIKey == "" {
		writeError(w, "apiKey required", http.StatusBadRequest)
		return
	}
	if _, err := h.client.SetProviderKey(r.Context(), &aisettingspb.SetProviderKeyRequest{
		UserId: userID,
		Id:     id,
		ApiKey: in.APIKey,
	}); err != nil {
		handleGRPCError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ClearKey handles DELETE /api/ai/settings/{id}/key.
func (h *AISettingsHandler) ClearKey(w http.ResponseWriter, r *http.Request) {
	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	if _, err := h.client.ClearProviderKey(r.Context(), &aisettingspb.ClearProviderKeyRequest{
		UserId: userID,
		Id:     id,
	}); err != nil {
		handleGRPCError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

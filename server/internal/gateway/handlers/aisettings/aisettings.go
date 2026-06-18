// Package handlers — AI settings CRUD + key management.
//
// These endpoints are the control surface for the hosted BYO path: users
// manage their provider rows (OpenAI / Anthropic / Gemini) through the
// gateway, the gateway defers to the ai-settings microservice which
// handles Postgres I/O and AES-256-GCM encryption of the API key. The
// plaintext key never crosses this boundary on the way out — it's only
// decrypted inside ai-settings for dispatch.
package aisettings

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
	"inkwell/server/pkg/aiadapter"
	aisettingspb "inkwell/server/pkg/grpc/aisettings"
)

// AISettingsHandler handles `/api/v1/ai/settings` CRUD + key endpoints.
type AISettingsHandler struct {
	client                aisettingspb.AISettingsServiceClient
	openAICompatibleHosts []string
}

// NewAISettingsHandler wires the HTTP layer to the AI settings gRPC client.
// openAICompatibleHosts is the operator-supplied allowlist (host[:port])
// used to gate `openai_compatible` provider rows at create/update time.
func NewAISettingsHandler(clients *grpcclient.Registry, openAICompatibleHosts []string) *AISettingsHandler {
	return &AISettingsHandler{
		client:                clients.AISettings,
		openAICompatibleHosts: openAICompatibleHosts,
	}
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

// decodeSaveInput reproduces the legacy "Invalid JSON body" decode-error
// message (the shared JSONBody helper would emit "invalid JSON" instead).
func decodeSaveInput(r *http.Request) (*saveInputDTO, error) {
	var in saveInputDTO
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		return nil, errors.New("Invalid JSON body")
	}
	return &in, nil
}

// decodeSetKey reproduces the legacy "Invalid JSON body" decode-error
// message for the key-set body.
func decodeSetKey(r *http.Request) (*setKeyDTO, error) {
	var in setKeyDTO
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		return nil, errors.New("Invalid JSON body")
	}
	return &in, nil
}

// guardOpenAICompatible rejects openai_compatible rows whose baseUrl
// host isn't on the operator-supplied allowlist. Other kinds pass
// through unchanged.
func (h *AISettingsHandler) guardOpenAICompatible(kind, baseURL string) error {
	if kind != string(aiadapter.KindOpenAICompatible) {
		return nil
	}
	return handlers.ValidateOpenAICompatibleURL(baseURL, h.openAICompatibleHosts)
}

// ── Endpoints ───────────────────────────────────────────────────────────────

// List handles GET /api/v1/ai/settings.
func (h *AISettingsHandler) List(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []settingDTO]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]settingDTO, error) {
			resp, err := h.client.ListProviderSettings(r.Context(), &aisettingspb.ListProviderSettingsRequest{UserId: userID})
			if err != nil {
				return nil, err
			}
			out := make([]settingDTO, len(resp.Settings))
			for i, s := range resp.Settings {
				out[i] = toDTO(s)
			}
			return &out, nil
		},
	}.ServeHTTP(w, r)
}

// Create handles POST /api/v1/ai/settings.
func (h *AISettingsHandler) Create(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[saveInputDTO, settingDTO]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: decodeSaveInput,
		Handle: func(r *http.Request, userID string, in *saveInputDTO) (*settingDTO, error) {
			if err := h.guardOpenAICompatible(in.Kind, in.BaseURL); err != nil {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, err.Error())
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
				return nil, err
			}
			dto := toDTO(resp.Setting)
			return &dto, nil
		},
	}.ServeHTTP(w, r)
}

// Update handles PUT/PATCH /api/v1/ai/settings/{id}.
func (h *AISettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[saveInputDTO, settingDTO]{
		// Registered for both PUT and PATCH; leave Method empty so the
		// wrapper doesn't reject either verb.
		Auth:   true,
		Decode: decodeSaveInput,
		Handle: func(r *http.Request, userID string, in *saveInputDTO) (*settingDTO, error) {
			id := chi.URLParam(r, "id")
			if err := h.guardOpenAICompatible(in.Kind, in.BaseURL); err != nil {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, err.Error())
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
				return nil, err
			}
			dto := toDTO(resp.Setting)
			return &dto, nil
		},
	}.ServeHTTP(w, r)
}

// Delete handles DELETE /api/v1/ai/settings/{id}.
func (h *AISettingsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			id := chi.URLParam(r, "id")
			if _, err := h.client.DeleteProviderSetting(r.Context(), &aisettingspb.DeleteProviderSettingRequest{
				UserId: userID,
				Id:     id,
			}); err != nil {
				return nil, err
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// SetKey handles POST /api/v1/ai/settings/{id}/key.
func (h *AISettingsHandler) SetKey(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[setKeyDTO, struct{}]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        decodeSetKey,
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, in *setKeyDTO) (*struct{}, error) {
			id := chi.URLParam(r, "id")
			if in.APIKey == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "apiKey required")
			}
			if _, err := h.client.SetProviderKey(r.Context(), &aisettingspb.SetProviderKeyRequest{
				UserId: userID,
				Id:     id,
				ApiKey: in.APIKey,
			}); err != nil {
				return nil, err
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// ClearKey handles DELETE /api/v1/ai/settings/{id}/key.
func (h *AISettingsHandler) ClearKey(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			id := chi.URLParam(r, "id")
			if _, err := h.client.ClearProviderKey(r.Context(), &aisettingspb.ClearProviderKeyRequest{
				UserId: userID,
				Id:     id,
			}); err != nil {
				return nil, err
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}

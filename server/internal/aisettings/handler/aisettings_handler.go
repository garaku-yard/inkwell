// Package handler implements the gRPC server for the ai-settings service.
package handler

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/aisettings/domain"
	"inkwell/server/internal/aisettings/service"
	aisettingspb "inkwell/server/pkg/grpc/aisettings"
	commonpb "inkwell/server/pkg/grpc/common"
)

// Handler bridges the gRPC wire to the service layer.
type Handler struct {
	aisettingspb.UnimplementedAISettingsServiceServer
	svc service.Service
}

// New constructs a Handler. Register the returned value on a grpc.Server
// via aisettingspb.RegisterAISettingsServiceServer.
func New(svc service.Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) ListProviderSettings(ctx context.Context, req *aisettingspb.ListProviderSettingsRequest) (*aisettingspb.ListProviderSettingsResponse, error) {
	userID, err := parseUUID(req.UserId, "user_id")
	if err != nil {
		return nil, err
	}
	rows, err := h.svc.List(ctx, userID)
	if err != nil {
		return nil, translateError(err)
	}
	out := make([]*aisettingspb.ProviderSetting, len(rows))
	for i := range rows {
		out[i] = mapSetting(&rows[i])
	}
	return &aisettingspb.ListProviderSettingsResponse{Settings: out}, nil
}

func (h *Handler) CreateProviderSetting(ctx context.Context, req *aisettingspb.CreateProviderSettingRequest) (*aisettingspb.CreateProviderSettingResponse, error) {
	userID, err := parseUUID(req.UserId, "user_id")
	if err != nil {
		return nil, err
	}
	row, err := h.svc.Create(ctx, service.CreateInput{
		UserID:       userID,
		Kind:         req.Kind,
		Label:        req.Label,
		Enabled:      req.Enabled,
		BaseURL:      req.BaseUrl,
		DefaultModel: req.DefaultModel,
	})
	if err != nil {
		return nil, translateError(err)
	}
	return &aisettingspb.CreateProviderSettingResponse{Setting: mapSetting(row)}, nil
}

func (h *Handler) UpdateProviderSetting(ctx context.Context, req *aisettingspb.UpdateProviderSettingRequest) (*aisettingspb.UpdateProviderSettingResponse, error) {
	userID, err := parseUUID(req.UserId, "user_id")
	if err != nil {
		return nil, err
	}
	id, err := parseUUID(req.Id, "id")
	if err != nil {
		return nil, err
	}
	row, err := h.svc.Update(ctx, service.UpdateInput{
		UserID:       userID,
		ID:           id,
		Kind:         req.Kind,
		Label:        req.Label,
		Enabled:      req.Enabled,
		BaseURL:      req.BaseUrl,
		DefaultModel: req.DefaultModel,
	})
	if err != nil {
		return nil, translateError(err)
	}
	return &aisettingspb.UpdateProviderSettingResponse{Setting: mapSetting(row)}, nil
}

func (h *Handler) DeleteProviderSetting(ctx context.Context, req *aisettingspb.DeleteProviderSettingRequest) (*aisettingspb.DeleteProviderSettingResponse, error) {
	userID, err := parseUUID(req.UserId, "user_id")
	if err != nil {
		return nil, err
	}
	id, err := parseUUID(req.Id, "id")
	if err != nil {
		return nil, err
	}
	if err := h.svc.Delete(ctx, userID, id); err != nil {
		return nil, translateError(err)
	}
	return &aisettingspb.DeleteProviderSettingResponse{}, nil
}

func (h *Handler) SetProviderKey(ctx context.Context, req *aisettingspb.SetProviderKeyRequest) (*aisettingspb.SetProviderKeyResponse, error) {
	userID, err := parseUUID(req.UserId, "user_id")
	if err != nil {
		return nil, err
	}
	id, err := parseUUID(req.Id, "id")
	if err != nil {
		return nil, err
	}
	if err := h.svc.SetKey(ctx, userID, id, req.ApiKey); err != nil {
		return nil, translateError(err)
	}
	return &aisettingspb.SetProviderKeyResponse{}, nil
}

func (h *Handler) ClearProviderKey(ctx context.Context, req *aisettingspb.ClearProviderKeyRequest) (*aisettingspb.ClearProviderKeyResponse, error) {
	userID, err := parseUUID(req.UserId, "user_id")
	if err != nil {
		return nil, err
	}
	id, err := parseUUID(req.Id, "id")
	if err != nil {
		return nil, err
	}
	if err := h.svc.ClearKey(ctx, userID, id); err != nil {
		return nil, translateError(err)
	}
	return &aisettingspb.ClearProviderKeyResponse{}, nil
}

func (h *Handler) GetForDispatch(ctx context.Context, req *aisettingspb.GetForDispatchRequest) (*aisettingspb.GetForDispatchResponse, error) {
	userID, err := parseUUID(req.UserId, "user_id")
	if err != nil {
		return nil, err
	}
	id, err := parseUUID(req.Id, "id")
	if err != nil {
		return nil, err
	}
	row, apiKey, err := h.svc.GetForDispatch(ctx, userID, id)
	if err != nil {
		return nil, translateError(err)
	}
	return &aisettingspb.GetForDispatchResponse{
		Setting: mapSetting(row),
		ApiKey:  apiKey,
	}, nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func parseUUID(raw, field string) (uuid.UUID, error) {
	if raw == "" {
		return uuid.Nil, status.Errorf(codes.InvalidArgument, "missing %s", field)
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, status.Errorf(codes.InvalidArgument, "invalid %s", field)
	}
	return id, nil
}

func translateError(err error) error {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return status.Error(codes.NotFound, "ai provider not found")
	case errors.Is(err, domain.ErrInvalidKind):
		return status.Error(codes.InvalidArgument, "invalid provider kind")
	case errors.Is(err, domain.ErrInvalidInput):
		return status.Error(codes.InvalidArgument, err.Error())
	default:
		return status.Error(codes.Internal, err.Error())
	}
}

func mapSetting(s *domain.ProviderSetting) *aisettingspb.ProviderSetting {
	return &aisettingspb.ProviderSetting{
		Id:           s.ID.String(),
		UserId:       s.UserID.String(),
		Kind:         string(s.Kind),
		Label:        s.Label,
		Enabled:      s.Enabled,
		BaseUrl:      s.BaseURL,
		DefaultModel: s.DefaultModel,
		HasKey:       s.HasKey(),
		KeyVersion:   s.KeyVersion,
		CreatedAt:    &commonpb.Timestamp{Seconds: s.CreatedAt.Unix(), Nanos: int32(s.CreatedAt.Nanosecond())},
		UpdatedAt:    &commonpb.Timestamp{Seconds: s.UpdatedAt.Unix(), Nanos: int32(s.UpdatedAt.Nanosecond())},
	}
}

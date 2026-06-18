package handler

import (
	"context"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/notifications/domain"
	"inkwell/server/internal/notifications/service"
	notificationspb "inkwell/server/pkg/grpc/notifications"
)

// NotificationHandler implements the NotificationsService gRPC server. It
// translates proto messages to domain types and delegates to the service.
type NotificationHandler struct {
	notificationspb.UnimplementedNotificationsServiceServer
	svc service.NotificationService
}

// NewNotificationHandler creates a handler backed by the given service.
func NewNotificationHandler(svc service.NotificationService) *NotificationHandler {
	return &NotificationHandler{svc: svc}
}

// GetPreferences returns the caller's notification preferences, or the all-on
// defaults when none are stored.
func (h *NotificationHandler) GetPreferences(ctx context.Context, req *notificationspb.GetPreferencesRequest) (*notificationspb.GetPreferencesResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	p, err := h.svc.GetPreferences(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &notificationspb.GetPreferencesResponse{Preferences: toProto(p)}, nil
}

// UpdatePreferences upserts the caller's full preference set.
func (h *NotificationHandler) UpdatePreferences(ctx context.Context, req *notificationspb.UpdatePreferencesRequest) (*notificationspb.UpdatePreferencesResponse, error) {
	if req.Preferences == nil {
		return nil, status.Error(codes.InvalidArgument, "preferences required")
	}
	userID, err := uuid.Parse(req.Preferences.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	p := fromProto(userID, req.Preferences)
	updated, err := h.svc.UpdatePreferences(ctx, p)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &notificationspb.UpdatePreferencesResponse{Preferences: toProto(updated)}, nil
}

// toProto converts a domain Preferences to its proto representation.
func toProto(p *domain.Preferences) *notificationspb.NotificationPreferences {
	return &notificationspb.NotificationPreferences{
		UserId:                 p.UserID.String(),
		EmailComments:          p.EmailComments,
		EmailMentions:          p.EmailMentions,
		EmailProjectUpdates:    p.EmailProjectUpdates,
		EmailCollaboratorJoins: p.EmailCollaboratorJoins,
		InAppNotifications:     p.InAppNotifications,
		MarketingEmails:        p.MarketingEmails,
		ProductUpdates:         p.ProductUpdates,
	}
}

// fromProto builds a domain Preferences from the proto message. The userID is
// taken from the parsed/authenticated id rather than re-parsing the string.
func fromProto(userID uuid.UUID, p *notificationspb.NotificationPreferences) *domain.Preferences {
	return &domain.Preferences{
		UserID:                 userID,
		EmailComments:          p.EmailComments,
		EmailMentions:          p.EmailMentions,
		EmailProjectUpdates:    p.EmailProjectUpdates,
		EmailCollaboratorJoins: p.EmailCollaboratorJoins,
		InAppNotifications:     p.InAppNotifications,
		MarketingEmails:        p.MarketingEmails,
		ProductUpdates:         p.ProductUpdates,
	}
}

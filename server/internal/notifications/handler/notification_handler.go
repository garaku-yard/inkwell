package handler

import (
	"context"
	"time"

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

// ListNotifications returns a page of the caller's in-app feed plus the unread total.
func (h *NotificationHandler) ListNotifications(ctx context.Context, req *notificationspb.ListNotificationsRequest) (*notificationspb.ListNotificationsResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	items, unread, err := h.svc.ListNotifications(ctx, userID, int(req.Limit), int(req.Offset))
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	out := make([]*notificationspb.Notification, len(items))
	for i := range items {
		out[i] = toProtoNotification(&items[i])
	}
	return &notificationspb.ListNotificationsResponse{Notifications: out, UnreadCount: int32(unread)}, nil
}

// MarkRead marks a single notification read, scoped to the caller.
func (h *NotificationHandler) MarkRead(ctx context.Context, req *notificationspb.MarkReadRequest) (*notificationspb.MarkReadResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	id, err := uuid.Parse(req.Id)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid notification id")
	}
	if err := h.svc.MarkRead(ctx, userID, id); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &notificationspb.MarkReadResponse{}, nil
}

// MarkAllRead marks every unread notification read for the caller.
func (h *NotificationHandler) MarkAllRead(ctx context.Context, req *notificationspb.MarkAllReadRequest) (*notificationspb.MarkAllReadResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	if err := h.svc.MarkAllRead(ctx, userID); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &notificationspb.MarkAllReadResponse{}, nil
}

// UnreadCount returns the caller's unread total.
func (h *NotificationHandler) UnreadCount(ctx context.Context, req *notificationspb.UnreadCountRequest) (*notificationspb.UnreadCountResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	count, err := h.svc.UnreadCount(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &notificationspb.UnreadCountResponse{Count: int32(count)}, nil
}

// toProtoNotification converts a domain Notification to its proto form.
func toProtoNotification(n *domain.Notification) *notificationspb.Notification {
	return &notificationspb.Notification{
		Id:        n.ID.String(),
		UserId:    n.UserID.String(),
		Type:      n.Type,
		Title:     n.Title,
		Body:      n.Body,
		Link:      n.Link,
		Read:      n.Read(),
		CreatedAt: n.CreatedAt.UTC().Format(time.RFC3339),
	}
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

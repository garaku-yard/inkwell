// Package notifications exposes the notification-preferences HTTP surface.
//
// Phase 1 covers per-user delivery preferences: the settings UI reads and
// writes the seven notification toggles through these endpoints, which defer
// to the notifications microservice over gRPC. The in-app feed and email
// delivery land in later phases and extend this handler.
package notifications

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
	notificationspb "inkwell/server/pkg/grpc/notifications"
)

// NotificationsHandler handles `/api/v1/notifications/*` endpoints.
type NotificationsHandler struct {
	client notificationspb.NotificationsServiceClient
}

// NewNotificationsHandler wires the HTTP layer to the notifications gRPC client.
func NewNotificationsHandler(clients *grpcclient.Registry) *NotificationsHandler {
	return &NotificationsHandler{client: clients.Notifications}
}

// ── DTO ───────────────────────────────────────────────────────────────────

// preferencesDTO is the JSON shape exchanged with the client. The field names
// match the client's NotificationPrefs interface verbatim so the settings
// section maps one-to-one.
type preferencesDTO struct {
	EmailComments          bool `json:"emailComments"`
	EmailMentions          bool `json:"emailMentions"`
	EmailProjectUpdates    bool `json:"emailProjectUpdates"`
	EmailCollaboratorJoins bool `json:"emailCollaboratorJoins"`
	InAppNotifications     bool `json:"inAppNotifications"`
	MarketingEmails        bool `json:"marketingEmails"`
	ProductUpdates         bool `json:"productUpdates"`
}

func toDTO(p *notificationspb.NotificationPreferences) preferencesDTO {
	return preferencesDTO{
		EmailComments:          p.EmailComments,
		EmailMentions:          p.EmailMentions,
		EmailProjectUpdates:    p.EmailProjectUpdates,
		EmailCollaboratorJoins: p.EmailCollaboratorJoins,
		InAppNotifications:     p.InAppNotifications,
		MarketingEmails:        p.MarketingEmails,
		ProductUpdates:         p.ProductUpdates,
	}
}

// notificationDTO is the JSON shape of a single in-app notification.
type notificationDTO struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Link      string `json:"link,omitempty"`
	Read      bool   `json:"read"`
	CreatedAt string `json:"createdAt"`
}

// listDTO is the GET /notifications response: a page plus the unread total.
type listDTO struct {
	Notifications []notificationDTO `json:"notifications"`
	UnreadCount   int32             `json:"unreadCount"`
}

func toNotificationDTO(n *notificationspb.Notification) notificationDTO {
	return notificationDTO{
		ID:        n.Id,
		Type:      n.Type,
		Title:     n.Title,
		Body:      n.Body,
		Link:      n.Link,
		Read:      n.Read,
		CreatedAt: n.CreatedAt,
	}
}

// ── Endpoints ───────────────────────────────────────────────────────────────

// GetPreferences handles GET /api/v1/notifications/preferences.
func (h *NotificationsHandler) GetPreferences(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, preferencesDTO]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*preferencesDTO, error) {
			resp, err := h.client.GetPreferences(r.Context(), &notificationspb.GetPreferencesRequest{UserId: userID})
			if err != nil {
				return nil, err
			}
			dto := toDTO(resp.Preferences)
			return &dto, nil
		},
	}.ServeHTTP(w, r)
}

// UpdatePreferences handles PUT /api/v1/notifications/preferences. The full
// preference set is sent on every save (the client holds all seven toggles in
// state), so there is no partial-update semantics to reconcile.
func (h *NotificationsHandler) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[preferencesDTO, preferencesDTO]{
		Method: http.MethodPut,
		Auth:   true,
		Decode: handlers.JSONBody[preferencesDTO],
		Handle: func(r *http.Request, userID string, in *preferencesDTO) (*preferencesDTO, error) {
			resp, err := h.client.UpdatePreferences(r.Context(), &notificationspb.UpdatePreferencesRequest{
				Preferences: &notificationspb.NotificationPreferences{
					UserId:                 userID,
					EmailComments:          in.EmailComments,
					EmailMentions:          in.EmailMentions,
					EmailProjectUpdates:    in.EmailProjectUpdates,
					EmailCollaboratorJoins: in.EmailCollaboratorJoins,
					InAppNotifications:     in.InAppNotifications,
					MarketingEmails:        in.MarketingEmails,
					ProductUpdates:         in.ProductUpdates,
				},
			})
			if err != nil {
				return nil, err
			}
			dto := toDTO(resp.Preferences)
			return &dto, nil
		},
	}.ServeHTTP(w, r)
}

// List handles GET /api/v1/notifications?limit=&offset= — the in-app feed.
func (h *NotificationsHandler) List(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, listDTO]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*listDTO, error) {
			limit := atoiOr(r.URL.Query().Get("limit"), 0)
			offset := atoiOr(r.URL.Query().Get("offset"), 0)
			resp, err := h.client.ListNotifications(r.Context(), &notificationspb.ListNotificationsRequest{
				UserId: userID,
				Limit:  int32(limit),
				Offset: int32(offset),
			})
			if err != nil {
				return nil, err
			}
			items := make([]notificationDTO, len(resp.Notifications))
			for i, n := range resp.Notifications {
				items[i] = toNotificationDTO(n)
			}
			return &listDTO{Notifications: items, UnreadCount: resp.UnreadCount}, nil
		},
	}.ServeHTTP(w, r)
}

// UnreadCount handles GET /api/v1/notifications/unread-count.
func (h *NotificationsHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	type countDTO struct {
		Count int32 `json:"count"`
	}
	handlers.Endpoint[struct{}, countDTO]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*countDTO, error) {
			resp, err := h.client.UnreadCount(r.Context(), &notificationspb.UnreadCountRequest{UserId: userID})
			if err != nil {
				return nil, err
			}
			return &countDTO{Count: resp.Count}, nil
		},
	}.ServeHTTP(w, r)
}

// MarkRead handles POST /api/v1/notifications/{id}/read.
func (h *NotificationsHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			id := chi.URLParam(r, "id")
			if _, err := h.client.MarkRead(r.Context(), &notificationspb.MarkReadRequest{UserId: userID, Id: id}); err != nil {
				return nil, err
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// MarkAllRead handles POST /api/v1/notifications/read-all.
func (h *NotificationsHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			if _, err := h.client.MarkAllRead(r.Context(), &notificationspb.MarkAllReadRequest{UserId: userID}); err != nil {
				return nil, err
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// atoiOr parses s as an int, returning fallback on any parse failure.
func atoiOr(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return n
}

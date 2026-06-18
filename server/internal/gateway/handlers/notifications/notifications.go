// Package notifications exposes the notification-preferences HTTP surface.
//
// Phase 1 covers per-user delivery preferences: the settings UI reads and
// writes the seven notification toggles through these endpoints, which defer
// to the notifications microservice over gRPC. The in-app feed and email
// delivery land in later phases and extend this handler.
package notifications

import (
	"net/http"

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

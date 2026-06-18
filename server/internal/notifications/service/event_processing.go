package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"inkwell/server/internal/notifications/domain"
	"inkwell/server/pkg/events"
)

// Process dispatches a consumed domain event to the matching delivery handler.
// Event types we don't deliver on are ignored (return nil) so the consumer
// commits and moves on. Each handler is idempotent via the delivery log, so a
// double-publish (inline + outbox) or Kafka redelivery produces at most one
// notification.
func (s *notificationService) Process(ctx context.Context, evt events.Event) error {
	switch evt.Type {
	case events.EventTypeCollabAdded:
		return s.handleCollabAdded(ctx, evt)
	default:
		return nil
	}
}

// collabAddedPayload is the JSON shape collab-service publishes for
// collaboration.added (all fields are stringified UUIDs except role).
type collabAddedPayload struct {
	ProjectID string `json:"project_id"`
	UserID    string `json:"user_id"`
	Role      string `json:"role"`
	InvitedBy string `json:"invited_by"`
}

// handleCollabAdded delivers an in-app "you were added to a project"
// notification to the added user, gated on their in-app master switch.
func (s *notificationService) handleCollabAdded(ctx context.Context, evt events.Event) error {
	var p collabAddedPayload
	if err := json.Unmarshal(evt.Payload, &p); err != nil {
		return fmt.Errorf("collab.added: unmarshal payload: %w", err)
	}
	recipient, err := uuid.Parse(p.UserID)
	if err != nil {
		return fmt.Errorf("collab.added: invalid user_id %q: %w", p.UserID, err)
	}

	prefs, err := s.GetPreferences(ctx, recipient)
	if err != nil {
		return fmt.Errorf("collab.added: load preferences: %w", err)
	}
	if !prefs.InAppNotifications {
		return nil // recipient turned the in-app feed off
	}

	role := p.Role
	if role == "" {
		role = "collaborator"
	}
	n := &domain.Notification{
		UserID: recipient,
		Type:   evt.Type,
		Title:  "Added to a project",
		Body:   fmt.Sprintf("You were added with the %s role.", role),
		Link:   "/projects/" + p.ProjectID,
	}

	// Dedup per (channel, event, project, recipient). The same logical event
	// arrives twice (inline + outbox) with identical payloads, so the natural
	// key collapses them. Known limitation: a remove-then-re-add to the same
	// project won't re-notify, since the key is identical.
	dedupKey := fmt.Sprintf("inapp:%s:%s:%s", evt.Type, p.ProjectID, p.UserID)
	created, err := s.repo.CreateNotificationIfNew(ctx, n, dedupKey)
	if err != nil {
		return err
	}
	if created {
		slog.Info("in-app notification delivered", "type", evt.Type, "user_id", p.UserID)
	}
	return nil
}

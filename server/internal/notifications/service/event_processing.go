package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"inkwell/server/internal/notifications/domain"
	"inkwell/server/internal/notifications/mailer"
	"inkwell/server/pkg/events"
)

// Process dispatches a consumed domain event to the matching delivery handler.
// Event types we don't deliver on are ignored (return nil) so the consumer
// commits and moves on. Each delivery is idempotent via the delivery log, so a
// double-publish (inline + outbox) or Kafka redelivery produces at most one
// notification and one email per channel.
func (s *notificationService) Process(ctx context.Context, evt events.Event) error {
	switch evt.Type {
	case events.EventTypeCollabAdded:
		return s.handleCollabAdded(ctx, evt)
	case events.EventTypeUserCreated:
		return s.handleUserCreated(ctx, evt)
	case events.EventTypeCommentAdded:
		return s.handleCommentAdded(ctx, evt)
	case events.EventTypeCollabInvited:
		return s.handleInvitationSent(ctx, evt)
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

	// Self-add: the project creator is registered as the "owner" collaborator on
	// their own project, which fires this event with InvitedBy == UserID. Don't
	// notify someone that they added themselves.
	if p.InvitedBy == p.UserID {
		return nil
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
	if prefs.InAppNotifications {
		inAppKey := fmt.Sprintf("inapp:%s:%s:%s", evt.Type, p.ProjectID, p.UserID)
		created, err := s.repo.CreateNotificationIfNew(ctx, n, inAppKey)
		if err != nil {
			return err
		}
		if created {
			slog.Info("in-app notification delivered", "type", evt.Type, "user_id", p.UserID)
		}
	}

	// Email is an independent channel with its own toggle and dedup key.
	// collaboration.added carries only the recipient's id, so resolve the
	// address via identity. When no lookup is wired (s.users == nil) email is
	// skipped — the in-app delivery above still happened.
	if prefs.EmailCollaboratorJoins && s.users != nil {
		email, _, err := s.users.Lookup(ctx, p.UserID)
		if err != nil {
			return fmt.Errorf("collab.added: resolve recipient email: %w", err)
		}
		if email == "" {
			return nil
		}
		emailKey := fmt.Sprintf("email:%s:%s:%s", evt.Type, p.ProjectID, p.UserID)
		body := fmt.Sprintf(
			`<p>You were added to a project on Inkwell with the <strong>%s</strong> role.</p>`+
				`<p><a href="%s/projects/%s">Open the project</a></p>`,
			role, s.appBaseURL, p.ProjectID,
		)
		if err := s.sendEmailIfNew(ctx, email, "You were added to a project", body, emailKey); err != nil {
			return err
		}
	}
	return nil
}

// userCreatedPayload is the JSON shape identity-service publishes for
// user.created. It carries the email directly, so no lookup is needed.
type userCreatedPayload struct {
	UserID   string `json:"user_id"`
	Email    string `json:"email"`
	Username string `json:"username"`
}

// handleUserCreated sends a one-time welcome email. It's transactional onboarding,
// so it isn't gated on a preference toggle (a brand-new user has no saved prefs).
func (s *notificationService) handleUserCreated(ctx context.Context, evt events.Event) error {
	var p userCreatedPayload
	if err := json.Unmarshal(evt.Payload, &p); err != nil {
		return fmt.Errorf("user.created: unmarshal payload: %w", err)
	}
	if p.Email == "" {
		return nil // nothing to send to
	}
	name := p.Username
	if name == "" {
		name = "there"
	}
	body := fmt.Sprintf(
		`<p>Hi %s,</p>`+
			`<p>Welcome to Inkwell — your writing lives on disk, yours to keep.</p>`+
			`<p><a href="%s">Open Inkwell</a></p>`,
		name, s.appBaseURL,
	)
	emailKey := fmt.Sprintf("email:%s:%s", evt.Type, p.UserID)
	return s.sendEmailIfNew(ctx, p.Email, "Welcome to Inkwell", body, emailKey)
}

// commentAddedPayload is the JSON shape collab-service publishes for
// comment.added. recipients are the project's collaborators minus the author.
type commentAddedPayload struct {
	ProjectID  string   `json:"project_id"`
	CommentID  string   `json:"comment_id"`
	AuthorID   string   `json:"author_id"`
	Recipients []string `json:"recipients"`
	Snippet    string   `json:"snippet"`
}

// handleCommentAdded fans out a new-comment notification to each recipient,
// honouring their in-app (master) and emailComments toggles independently. A
// per-recipient error aborts the event so it retries; already-delivered
// recipients are skipped on the retry via their dedup keys.
func (s *notificationService) handleCommentAdded(ctx context.Context, evt events.Event) error {
	var p commentAddedPayload
	if err := json.Unmarshal(evt.Payload, &p); err != nil {
		return fmt.Errorf("comment.added: unmarshal payload: %w", err)
	}
	body := p.Snippet
	if body == "" {
		body = "Someone commented on a project you collaborate on."
	}
	link := "/projects/" + p.ProjectID

	for _, rid := range p.Recipients {
		recipient, err := uuid.Parse(rid)
		if err != nil {
			continue // skip a malformed recipient rather than wedging the batch
		}
		prefs, err := s.GetPreferences(ctx, recipient)
		if err != nil {
			return fmt.Errorf("comment.added: load preferences: %w", err)
		}

		if prefs.InAppNotifications {
			n := &domain.Notification{
				UserID: recipient,
				Type:   evt.Type,
				Title:  "New comment",
				Body:   body,
				Link:   link,
			}
			inAppKey := fmt.Sprintf("inapp:%s:%s:%s", evt.Type, p.CommentID, rid)
			if _, err := s.repo.CreateNotificationIfNew(ctx, n, inAppKey); err != nil {
				return err
			}
		}

		if prefs.EmailComments && s.users != nil {
			email, _, err := s.users.Lookup(ctx, rid)
			if err != nil {
				return fmt.Errorf("comment.added: resolve recipient email: %w", err)
			}
			if email == "" {
				continue
			}
			emailKey := fmt.Sprintf("email:%s:%s:%s", evt.Type, p.CommentID, rid)
			emailBody := fmt.Sprintf(
				`<p>There's a new comment on a project you collaborate on:</p>`+
					`<blockquote>%s</blockquote>`+
					`<p><a href="%s%s">Open the project</a></p>`,
				body, s.appBaseURL, link,
			)
			if err := s.sendEmailIfNew(ctx, email, "New comment on your project", emailBody, emailKey); err != nil {
				return err
			}
		}
	}
	return nil
}

// invitationSentPayload is the JSON shape collab-service publishes for
// collaboration.invited (an email invite to a possibly-not-yet-registered user).
type invitationSentPayload struct {
	ProjectID string `json:"project_id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	InvitedBy string `json:"invited_by"`
	Token     string `json:"token"`
}

// handleInvitationSent emails an invitee an accept link. There's no preference
// to consult — the invitee may not have an account yet — so this is always sent
// (once, via the token dedup key). It's the email that makes "invite by email"
// actually reach the recipient.
func (s *notificationService) handleInvitationSent(ctx context.Context, evt events.Event) error {
	var p invitationSentPayload
	if err := json.Unmarshal(evt.Payload, &p); err != nil {
		return fmt.Errorf("collaboration.invited: unmarshal payload: %w", err)
	}
	if p.Email == "" {
		return nil
	}
	body := fmt.Sprintf(
		`<p>You've been invited to collaborate on a project in Inkwell as a <strong>%s</strong>.</p>`+
			`<p>Sign in (or create an account) with this email to accept:</p>`+
			`<p><a href="%s/invites">View your invitations</a></p>`,
		roleOrDefault(p.Role), s.appBaseURL,
	)
	dedupKey := fmt.Sprintf("email:%s:%s", evt.Type, p.Token)
	return s.sendEmailIfNew(ctx, p.Email, "You've been invited to a project", body, dedupKey)
}

func roleOrDefault(role string) string {
	if role == "" {
		return "collaborator"
	}
	return role
}

// sendEmailIfNew sends the email at most once per dedupKey. It checks the
// delivery log, sends, then records the delivery — relying on the consumer
// processing a partition sequentially (so the producer's double-publish, ~10s
// apart, is never in flight concurrently). On send failure it records nothing
// and returns an error, leaving the Kafka offset uncommitted so the message is
// retried (the second publish is a natural second attempt). Worst case is a
// duplicate email if we crash between a successful send and recording it.
func (s *notificationService) sendEmailIfNew(ctx context.Context, to, subject, body, dedupKey string) error {
	exists, err := s.repo.DeliveryExists(ctx, dedupKey)
	if err != nil {
		return err
	}
	if exists {
		return nil // already sent
	}
	if err := s.mailer.Send(ctx, mailer.Message{To: to, Subject: subject, Body: body}); err != nil {
		return fmt.Errorf("send email %q: %w", dedupKey, err)
	}
	if err := s.repo.RecordDelivery(ctx, dedupKey); err != nil {
		return err
	}
	slog.Info("email delivered", "to", to, "subject", subject)
	return nil
}

package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"

	"inkwell/server/internal/notifications/domain"
	"inkwell/server/internal/notifications/mailer"
	"inkwell/server/pkg/events"
)

// captureMailer records the emails Send is asked to deliver.
type captureMailer struct {
	sent []mailer.Message
	fail bool
}

func TestEventDeliveryKeyUsesStableEventIdentityPerRecipient(t *testing.T) {
	event := events.Event{ID: "stable-event", Type: events.EventTypeCollabAdded}
	first := eventDeliveryKey("inapp", event, "user-a", "legacy")
	duplicate := eventDeliveryKey("inapp", event, "user-a", "different-legacy")
	otherRecipient := eventDeliveryKey("inapp", event, "user-b", "legacy")
	otherEvent := eventDeliveryKey("inapp", events.Event{ID: "later-event", Type: event.Type}, "user-a", "legacy")
	if first != duplicate {
		t.Fatal("the same event and recipient produced different dedup keys")
	}
	if first == otherRecipient || first == otherEvent {
		t.Fatal("distinct recipients or logical events shared a dedup key")
	}
}

func (m *captureMailer) Send(_ context.Context, msg mailer.Message) error {
	if m.fail {
		return errors.New("smtp boom")
	}
	m.sent = append(m.sent, msg)
	return nil
}

// fakeUsers is a static user-id → email lookup.
type fakeUsers map[string]string

func (f fakeUsers) Lookup(_ context.Context, userID string) (string, string, error) {
	email, ok := f[userID]
	if !ok {
		return "", "", errors.New("user not found")
	}
	return email, "Tester", nil
}

// newSvc builds a service with a capture mailer + user lookup for tests.
func newSvc(repo *fakeRepo, mail *captureMailer, users fakeUsers) NotificationService {
	return NewNotificationService(repo, mail, users, "https://app.test")
}

// collabAddedEvent builds a collaboration.added envelope for the given ids.
func collabAddedEvent(projectID, userID, invitedBy uuid.UUID, role string) events.Event {
	payload, _ := json.Marshal(map[string]string{
		"project_id": projectID.String(),
		"user_id":    userID.String(),
		"role":       role,
		"invited_by": invitedBy.String(),
	})
	return events.Event{Type: events.EventTypeCollabAdded, Payload: payload}
}

// commentAddedEvent builds a comment.added envelope.
func commentAddedEvent(projectID, commentID, authorID uuid.UUID, recipients []string, snippet string) events.Event {
	payload, _ := json.Marshal(map[string]any{
		"project_id": projectID.String(),
		"comment_id": commentID.String(),
		"author_id":  authorID.String(),
		"recipients": recipients,
		"snippet":    snippet,
	})
	return events.Event{Type: events.EventTypeCommentAdded, Payload: payload}
}

// fakeRepo is an in-memory NotificationRepository for service tests. A missing
// preferences entry models "no row saved yet".
type fakeRepo struct {
	store    map[uuid.UUID]domain.Preferences
	upserted int

	notifs []domain.Notification
	dedup  map[string]bool
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		store: make(map[uuid.UUID]domain.Preferences),
		dedup: make(map[string]bool),
	}
}

func (r *fakeRepo) GetPreferences(_ context.Context, userID uuid.UUID) (*domain.Preferences, error) {
	p, ok := r.store[userID]
	if !ok {
		return nil, domain.ErrPreferencesNotFound
	}
	return &p, nil
}

func (r *fakeRepo) UpsertPreferences(_ context.Context, p *domain.Preferences) error {
	r.upserted++
	r.store[p.UserID] = *p
	return nil
}

func (r *fakeRepo) CreateNotificationIfNew(_ context.Context, n *domain.Notification, dedupKey string) (bool, error) {
	if r.dedup[dedupKey] {
		return false, nil
	}
	r.dedup[dedupKey] = true
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	r.notifs = append(r.notifs, *n)
	return true, nil
}

func (r *fakeRepo) ListNotifications(_ context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, error) {
	var out []domain.Notification
	for _, n := range r.notifs {
		if n.UserID == userID {
			out = append(out, n)
		}
	}
	return out, nil
}

func (r *fakeRepo) CountUnread(_ context.Context, userID uuid.UUID) (int, error) {
	count := 0
	for _, n := range r.notifs {
		if n.UserID == userID && n.ReadAt == nil {
			count++
		}
	}
	return count, nil
}

func (r *fakeRepo) MarkRead(_ context.Context, userID, id uuid.UUID) error { return nil }
func (r *fakeRepo) MarkAllRead(_ context.Context, userID uuid.UUID) error  { return nil }

func (r *fakeRepo) DeliveryExists(_ context.Context, dedupKey string) (bool, error) {
	return r.dedup[dedupKey], nil
}

func (r *fakeRepo) RecordDelivery(_ context.Context, dedupKey string) error {
	r.dedup[dedupKey] = true
	return nil
}

// GetPreferences must synthesize the all-on (except marketing) defaults when a
// user has never saved a row, never surfacing ErrPreferencesNotFound.
func TestGetPreferences_DefaultsWhenAbsent(t *testing.T) {
	svc := NewNotificationService(newFakeRepo(), nil, nil, "")
	userID := uuid.New()

	got, err := svc.GetPreferences(context.Background(), userID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := domain.DefaultPreferences(userID)
	if *got != want {
		t.Fatalf("defaults mismatch:\n got: %+v\nwant: %+v", *got, want)
	}
	if got.MarketingEmails {
		t.Error("marketing emails should default to off")
	}
	if !got.EmailComments || !got.InAppNotifications {
		t.Error("comment + in-app defaults should be on")
	}
}

// GetPreferences must return the stored row verbatim once one exists.
func TestGetPreferences_ReturnsStored(t *testing.T) {
	repo := newFakeRepo()
	svc := NewNotificationService(repo, nil, nil, "")
	userID := uuid.New()

	stored := domain.DefaultPreferences(userID)
	stored.EmailComments = false
	stored.MarketingEmails = true
	repo.store[userID] = stored

	got, err := svc.GetPreferences(context.Background(), userID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.EmailComments {
		t.Error("expected emailComments=false from stored row")
	}
	if !got.MarketingEmails {
		t.Error("expected marketingEmails=true from stored row")
	}
}

// UpdatePreferences must upsert and return the freshly stored values.
func TestUpdatePreferences_UpsertsAndReturns(t *testing.T) {
	repo := newFakeRepo()
	svc := NewNotificationService(repo, nil, nil, "")
	userID := uuid.New()

	in := domain.DefaultPreferences(userID)
	in.EmailMentions = false
	in.ProductUpdates = false

	got, err := svc.UpdatePreferences(context.Background(), &in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.upserted != 1 {
		t.Fatalf("expected exactly one upsert, got %d", repo.upserted)
	}
	if got.EmailMentions || got.ProductUpdates {
		t.Error("updated toggles not reflected in returned preferences")
	}
}

// Process must create exactly one in-app notification for collaboration.added,
// addressed to the added user, and dedupe the producer's double-publish.
func TestProcess_CollabAdded_CreatesOneNotification(t *testing.T) {
	repo := newFakeRepo()
	svc := NewNotificationService(repo, nil, nil, "")
	project, recipient, inviter := uuid.New(), uuid.New(), uuid.New()
	evt := collabAddedEvent(project, recipient, inviter, "editor")

	// Same logical event published twice (inline + outbox) → identical payload.
	for i := 0; i < 2; i++ {
		if err := svc.Process(context.Background(), evt); err != nil {
			t.Fatalf("process #%d: %v", i, err)
		}
	}

	items, _ := repo.ListNotifications(context.Background(), recipient, 50, 0)
	if len(items) != 1 {
		t.Fatalf("expected exactly 1 notification after double-publish, got %d", len(items))
	}
	n := items[0]
	if n.Type != events.EventTypeCollabAdded {
		t.Errorf("type = %q, want %q", n.Type, events.EventTypeCollabAdded)
	}
	if n.Link != "/projects/"+project.String() {
		t.Errorf("link = %q, want project link", n.Link)
	}
	if n.Read() {
		t.Error("new notification should be unread")
	}
}

// Process must skip in-app delivery when the recipient disabled the feed.
func TestProcess_CollabAdded_RespectsInAppOff(t *testing.T) {
	repo := newFakeRepo()
	svc := NewNotificationService(repo, nil, nil, "")
	project, recipient, inviter := uuid.New(), uuid.New(), uuid.New()

	prefs := domain.DefaultPreferences(recipient)
	prefs.InAppNotifications = false
	repo.store[recipient] = prefs

	if err := svc.Process(context.Background(), collabAddedEvent(project, recipient, inviter, "viewer")); err != nil {
		t.Fatalf("process: %v", err)
	}
	if len(repo.notifs) != 0 {
		t.Fatalf("expected no notification when in-app is off, got %d", len(repo.notifs))
	}
}

// Unknown event types are ignored without error or side effects.
func TestProcess_UnknownType_Ignored(t *testing.T) {
	repo := newFakeRepo()
	svc := NewNotificationService(repo, nil, nil, "")

	evt := events.Event{Type: "billing.updated", Payload: json.RawMessage(`{}`)}
	if err := svc.Process(context.Background(), evt); err != nil {
		t.Fatalf("unexpected error for unknown type: %v", err)
	}
	if len(repo.notifs) != 0 {
		t.Error("unknown event should not create notifications")
	}
}

// collaboration.added must email the added user (address resolved via lookup)
// when their collaborator-join email toggle is on, exactly once across the
// producer's double-publish.
func TestProcess_CollabAdded_SendsEmail(t *testing.T) {
	repo := newFakeRepo()
	mail := &captureMailer{}
	project, recipient, inviter := uuid.New(), uuid.New(), uuid.New()
	svc := newSvc(repo, mail, fakeUsers{recipient.String(): "added@example.com"})
	evt := collabAddedEvent(project, recipient, inviter, "editor")

	for i := 0; i < 2; i++ {
		if err := svc.Process(context.Background(), evt); err != nil {
			t.Fatalf("process #%d: %v", i, err)
		}
	}
	if len(mail.sent) != 1 {
		t.Fatalf("expected exactly 1 email after double-publish, got %d", len(mail.sent))
	}
	if mail.sent[0].To != "added@example.com" {
		t.Errorf("email To = %q, want the resolved recipient address", mail.sent[0].To)
	}
}

// collaboration.added must not email when the collaborator-join toggle is off
// (the in-app delivery is governed separately).
func TestProcess_CollabAdded_RespectsEmailOff(t *testing.T) {
	repo := newFakeRepo()
	mail := &captureMailer{}
	project, recipient, inviter := uuid.New(), uuid.New(), uuid.New()
	prefs := domain.DefaultPreferences(recipient)
	prefs.EmailCollaboratorJoins = false
	repo.store[recipient] = prefs
	svc := newSvc(repo, mail, fakeUsers{recipient.String(): "added@example.com"})

	if err := svc.Process(context.Background(), collabAddedEvent(project, recipient, inviter, "viewer")); err != nil {
		t.Fatalf("process: %v", err)
	}
	if len(mail.sent) != 0 {
		t.Fatalf("expected no email when collaborator-join email is off, got %d", len(mail.sent))
	}
}

// user.created must send exactly one welcome email to the payload address.
func TestProcess_UserCreated_SendsWelcome(t *testing.T) {
	repo := newFakeRepo()
	mail := &captureMailer{}
	svc := newSvc(repo, mail, fakeUsers{})
	userID := uuid.New()
	payload, _ := json.Marshal(map[string]string{
		"user_id": userID.String(), "email": "new@example.com", "username": "newbie",
	})
	evt := events.Event{Type: events.EventTypeUserCreated, Payload: payload}

	for i := 0; i < 2; i++ {
		if err := svc.Process(context.Background(), evt); err != nil {
			t.Fatalf("process #%d: %v", i, err)
		}
	}
	if len(mail.sent) != 1 {
		t.Fatalf("expected exactly 1 welcome email after double-publish, got %d", len(mail.sent))
	}
	if mail.sent[0].To != "new@example.com" {
		t.Errorf("welcome To = %q", mail.sent[0].To)
	}
}

// A send failure must surface as an error and record no delivery, so the
// message stays uncommitted and is retried.
func TestProcess_UserCreated_SendFailureIsRetryable(t *testing.T) {
	repo := newFakeRepo()
	mail := &captureMailer{fail: true}
	svc := newSvc(repo, mail, fakeUsers{})
	userID := uuid.New()
	payload, _ := json.Marshal(map[string]string{
		"user_id": userID.String(), "email": "new@example.com", "username": "newbie",
	})
	evt := events.Event{Type: events.EventTypeUserCreated, Payload: payload}

	if err := svc.Process(context.Background(), evt); err == nil {
		t.Fatal("expected an error when the send fails")
	}
	exists, _ := repo.DeliveryExists(context.Background(), "email:user.created:"+userID.String())
	if exists {
		t.Error("a failed send must not record a delivery (it must remain retryable)")
	}
}

// comment.added must fan out one in-app notification and one email per
// recipient, deduped across the producer's double-publish.
func TestProcess_CommentAdded_FansOut(t *testing.T) {
	repo := newFakeRepo()
	mail := &captureMailer{}
	project, comment, author := uuid.New(), uuid.New(), uuid.New()
	r1, r2 := uuid.New(), uuid.New()
	svc := newSvc(repo, mail, fakeUsers{r1.String(): "r1@example.com", r2.String(): "r2@example.com"})
	evt := commentAddedEvent(project, comment, author, []string{r1.String(), r2.String()}, "Nice scene")

	for i := 0; i < 2; i++ {
		if err := svc.Process(context.Background(), evt); err != nil {
			t.Fatalf("process #%d: %v", i, err)
		}
	}
	if len(repo.notifs) != 2 {
		t.Fatalf("expected 2 in-app notifications (one per recipient), got %d", len(repo.notifs))
	}
	if len(mail.sent) != 2 {
		t.Fatalf("expected 2 emails (one per recipient), got %d", len(mail.sent))
	}
}

// A recipient with emailComments off gets the in-app notification but no email.
func TestProcess_CommentAdded_RespectsEmailCommentsOff(t *testing.T) {
	repo := newFakeRepo()
	mail := &captureMailer{}
	project, comment, author := uuid.New(), uuid.New(), uuid.New()
	r1 := uuid.New()
	prefs := domain.DefaultPreferences(r1)
	prefs.EmailComments = false
	repo.store[r1] = prefs
	svc := newSvc(repo, mail, fakeUsers{r1.String(): "r1@example.com"})

	if err := svc.Process(context.Background(), commentAddedEvent(project, comment, author, []string{r1.String()}, "hi")); err != nil {
		t.Fatalf("process: %v", err)
	}
	if len(repo.notifs) != 1 {
		t.Fatalf("expected 1 in-app notification, got %d", len(repo.notifs))
	}
	if len(mail.sent) != 0 {
		t.Fatalf("expected no email when emailComments is off, got %d", len(mail.sent))
	}
}

// collaboration.invited must email the invitee (no preference gate) exactly once.
func TestProcess_InvitationSent_SendsEmail(t *testing.T) {
	repo := newFakeRepo()
	mail := &captureMailer{}
	svc := newSvc(repo, mail, fakeUsers{})
	payload, _ := json.Marshal(map[string]string{
		"project_id": uuid.New().String(),
		"email":      "invitee@example.com",
		"role":       "editor",
		"invited_by": uuid.New().String(),
		"token":      "tok-123",
	})
	evt := events.Event{Type: events.EventTypeCollabInvited, Payload: payload}

	for i := 0; i < 2; i++ {
		if err := svc.Process(context.Background(), evt); err != nil {
			t.Fatalf("process #%d: %v", i, err)
		}
	}
	if len(mail.sent) != 1 {
		t.Fatalf("expected exactly 1 invite email after double-publish, got %d", len(mail.sent))
	}
	if mail.sent[0].To != "invitee@example.com" {
		t.Errorf("invite To = %q", mail.sent[0].To)
	}
}

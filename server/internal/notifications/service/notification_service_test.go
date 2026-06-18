package service

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	"inkwell/server/internal/notifications/domain"
	"inkwell/server/pkg/events"
)

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

// GetPreferences must synthesize the all-on (except marketing) defaults when a
// user has never saved a row, never surfacing ErrPreferencesNotFound.
func TestGetPreferences_DefaultsWhenAbsent(t *testing.T) {
	svc := NewNotificationService(newFakeRepo())
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
	svc := NewNotificationService(repo)
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
	svc := NewNotificationService(repo)
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
	svc := NewNotificationService(repo)
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
	svc := NewNotificationService(repo)
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
	svc := NewNotificationService(repo)

	evt := events.Event{Type: "billing.updated", Payload: json.RawMessage(`{}`)}
	if err := svc.Process(context.Background(), evt); err != nil {
		t.Fatalf("unexpected error for unknown type: %v", err)
	}
	if len(repo.notifs) != 0 {
		t.Error("unknown event should not create notifications")
	}
}

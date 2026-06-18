package service

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"inkwell/server/internal/notifications/domain"
)

// fakeRepo is an in-memory NotificationRepository for service tests. A nil
// entry for a user models "no row saved yet".
type fakeRepo struct {
	store    map[uuid.UUID]domain.Preferences
	upserted int
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{store: make(map[uuid.UUID]domain.Preferences)}
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

package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"inkwell/server/internal/collab/domain"
	"inkwell/server/internal/collab/repository"
)

// fakeSessionRepo is an in-memory CollaborationRepository double covering just
// the edit-session methods. The interface is embedded so the rest of the surface
// is present (and panics if unexpectedly called). It honours the staleBefore
// cutoff the service passes, so staleness behaviour is exercised end to end.
type fakeSessionRepo struct {
	repository.CollaborationRepository
	sessions map[uuid.UUID]*domain.EditSession
	ended    map[uuid.UUID]bool
}

func newFakeSessionRepo() *fakeSessionRepo {
	return &fakeSessionRepo{
		sessions: make(map[uuid.UUID]*domain.EditSession),
		ended:    make(map[uuid.UUID]bool),
	}
}

func (r *fakeSessionRepo) CreateEditSession(_ context.Context, s *domain.EditSession) error {
	// Mirror the real repo, which stamps both timestamps from the DB clock and
	// reads them back onto the caller's struct.
	now := time.Now()
	s.StartedAt = now
	s.LastActivity = now
	cp := *s
	r.sessions[s.ID] = &cp
	return nil
}

func (r *fakeSessionRepo) GetActiveEditSessionForUser(_ context.Context, projectID, userID uuid.UUID) (*domain.EditSession, error) {
	var best *domain.EditSession
	for id, s := range r.sessions {
		if r.ended[id] || s.ProjectID != projectID || s.UserID != userID {
			continue
		}
		if best == nil || s.LastActivity.After(best.LastActivity) {
			cp := *s
			best = &cp
		}
	}
	if best == nil {
		return nil, domain.ErrEditSessionNotFound
	}
	return best, nil
}

func (r *fakeSessionRepo) UpdateEditSessionFocus(_ context.Context, sessionID uuid.UUID, elementID uuid.NullUUID) error {
	s, ok := r.sessions[sessionID]
	if !ok || r.ended[sessionID] {
		return domain.ErrEditSessionNotFound
	}
	s.ElementID = elementID
	s.LastActivity = time.Now()
	return nil
}

func (r *fakeSessionRepo) EndEditSession(_ context.Context, sessionID uuid.UUID) error {
	r.ended[sessionID] = true // idempotent: closing a missing/closed session is fine
	return nil
}

func (r *fakeSessionRepo) ListActiveProjectEditSessions(_ context.Context, projectID uuid.UUID, staleAfter time.Duration) ([]*domain.EditSession, error) {
	cutoff := time.Now().Add(-staleAfter)
	out := make([]*domain.EditSession, 0)
	for id, s := range r.sessions {
		if r.ended[id] || s.ProjectID != projectID || !s.LastActivity.After(cutoff) {
			continue
		}
		cp := *s
		out = append(out, &cp)
	}
	return out, nil
}

func (r *fakeSessionRepo) SweepStaleEditSessions(_ context.Context, staleAfter time.Duration) (int64, error) {
	cutoff := time.Now().Add(-staleAfter)
	var n int64
	for id, s := range r.sessions {
		if !r.ended[id] && s.LastActivity.Before(cutoff) {
			r.ended[id] = true
			n++
		}
	}
	return n, nil
}

func newSessionSvc(repo repository.CollaborationRepository) *CollaborationService {
	return NewCollaborationService(nil, repo, nil, nil)
}

func nullUUID(u uuid.UUID) uuid.NullUUID { return uuid.NullUUID{UUID: u, Valid: true} }

func TestRecordEditFocus_CreatesThenUpsertsSameSession(t *testing.T) {
	repo := newFakeSessionRepo()
	svc := newSessionSvc(repo)
	projectID, userID := uuid.New(), uuid.New()
	el1, el2 := uuid.New(), uuid.New()

	first, err := svc.RecordEditFocus(context.Background(), projectID, userID, nullUUID(el1))
	if err != nil {
		t.Fatalf("first RecordEditFocus: %v", err)
	}
	if first.ElementID.UUID != el1 {
		t.Fatalf("first session element = %v, want %v", first.ElementID.UUID, el1)
	}

	second, err := svc.RecordEditFocus(context.Background(), projectID, userID, nullUUID(el2))
	if err != nil {
		t.Fatalf("second RecordEditFocus: %v", err)
	}
	if second.ID != first.ID {
		t.Fatalf("second call created a new session (%v) instead of upserting (%v)", second.ID, first.ID)
	}
	if second.ElementID.UUID != el2 {
		t.Fatalf("focus not moved: element = %v, want %v", second.ElementID.UUID, el2)
	}
	if len(repo.sessions) != 1 {
		t.Fatalf("expected exactly one persisted session, got %d", len(repo.sessions))
	}
}

func TestRecordEditFocus_JoinWithoutFocus(t *testing.T) {
	repo := newFakeSessionRepo()
	svc := newSessionSvc(repo)
	projectID, userID := uuid.New(), uuid.New()

	s, err := svc.RecordEditFocus(context.Background(), projectID, userID, uuid.NullUUID{})
	if err != nil {
		t.Fatalf("RecordEditFocus: %v", err)
	}
	if s.ElementID.Valid {
		t.Fatalf("join session should have no focus, got element %v", s.ElementID.UUID)
	}
}

func TestEndEditSession_Idempotent(t *testing.T) {
	repo := newFakeSessionRepo()
	svc := newSessionSvc(repo)
	projectID, userID := uuid.New(), uuid.New()

	s, err := svc.RecordEditFocus(context.Background(), projectID, userID, uuid.NullUUID{})
	if err != nil {
		t.Fatalf("RecordEditFocus: %v", err)
	}
	if err := svc.EndEditSession(context.Background(), s.ID); err != nil {
		t.Fatalf("first end: %v", err)
	}
	// Second end must not error — the disconnect path can double-close.
	if err := svc.EndEditSession(context.Background(), s.ID); err != nil {
		t.Fatalf("second end should be a no-op, got %v", err)
	}
	// Ended session must not appear in the active list.
	active, err := svc.ListActiveEditSessions(context.Background(), projectID)
	if err != nil {
		t.Fatalf("ListActiveEditSessions: %v", err)
	}
	if len(active) != 0 {
		t.Fatalf("ended session still active: %d rows", len(active))
	}
}

func TestListActiveEditSessions_FiltersStale(t *testing.T) {
	repo := newFakeSessionRepo()
	svc := newSessionSvc(repo)
	projectID := uuid.New()

	fresh, err := svc.RecordEditFocus(context.Background(), projectID, uuid.New(), uuid.NullUUID{})
	if err != nil {
		t.Fatalf("fresh RecordEditFocus: %v", err)
	}
	stale, err := svc.RecordEditFocus(context.Background(), projectID, uuid.New(), uuid.NullUUID{})
	if err != nil {
		t.Fatalf("stale RecordEditFocus: %v", err)
	}
	// Backdate the stale session past the staleness window.
	repo.sessions[stale.ID].LastActivity = time.Now().Add(-editSessionStaleAfter - time.Minute)

	active, err := svc.ListActiveEditSessions(context.Background(), projectID)
	if err != nil {
		t.Fatalf("ListActiveEditSessions: %v", err)
	}
	if len(active) != 1 || active[0].ID != fresh.ID {
		t.Fatalf("expected only the fresh session, got %d rows", len(active))
	}
}

func TestSweepStaleEditSessions(t *testing.T) {
	repo := newFakeSessionRepo()
	svc := newSessionSvc(repo)
	projectID := uuid.New()

	fresh, _ := svc.RecordEditFocus(context.Background(), projectID, uuid.New(), uuid.NullUUID{})
	stale, _ := svc.RecordEditFocus(context.Background(), projectID, uuid.New(), uuid.NullUUID{})
	repo.sessions[stale.ID].LastActivity = time.Now().Add(-editSessionStaleAfter - time.Minute)

	closed, err := svc.SweepStaleEditSessions(context.Background())
	if err != nil {
		t.Fatalf("SweepStaleEditSessions: %v", err)
	}
	if closed != 1 {
		t.Fatalf("swept %d sessions, want 1", closed)
	}
	if !repo.ended[stale.ID] {
		t.Fatal("stale session was not closed")
	}
	if repo.ended[fresh.ID] {
		t.Fatal("fresh session should not have been closed")
	}
}

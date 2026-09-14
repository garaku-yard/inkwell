package outbox

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"inkwell/server/pkg/events"
)

type recordingPublisher struct {
	mu     sync.Mutex
	events []events.Event
	err    error
}

func (p *recordingPublisher) Publish(context.Context, string, any) error {
	return errors.New("legacy publish used")
}
func (p *recordingPublisher) PublishEvent(_ context.Context, event events.Event) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(p.events, event)
	return p.err
}

type memoryStore struct {
	mu          sync.Mutex
	event       Event
	claimed     bool
	published   bool
	failed      bool
	markPublish error
}

func (*memoryStore) EnqueueTx(context.Context, *sql.Tx, Event) error { return nil }
func (s *memoryStore) ClaimPending(_ context.Context, claimant string, _ int, _ time.Duration) ([]Event, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.claimed || s.published || s.failed {
		return nil, nil
	}
	s.claimed = true
	s.event.Attempt++
	s.event.ClaimedBy = claimant
	return []Event{s.event}, nil
}
func (s *memoryStore) MarkPublished(_ context.Context, _ uuid.UUID, _ string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.markPublish != nil {
		s.claimed = false // model lease expiry after the crash window
		return s.markPublish
	}
	s.published = true
	return nil
}
func (s *memoryStore) MarkFailed(_ context.Context, _ uuid.UUID, _, _ string, _ int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.failed = true
	return nil
}

func TestPollerPreservesStableIDAfterPublishMarkCrashWindow(t *testing.T) {
	id := uuid.New()
	store := &memoryStore{event: Event{ID: id, Type: events.EventTypeProjectDeleted, Payload: json.RawMessage(`{"project_id":"p"}`), CreatedAt: time.Now()}, markPublish: errors.New("database unavailable")}
	publisher := &recordingPublisher{}
	poller := NewPoller(store, publisher, time.Second, 1)

	poller.drain(context.Background())
	store.markPublish = nil
	poller.drain(context.Background())

	if len(publisher.events) != 2 {
		t.Fatalf("published %d times, want duplicate retry", len(publisher.events))
	}
	for _, event := range publisher.events {
		if event.ID != id.String() {
			t.Fatalf("event ID = %q, want stable %q", event.ID, id)
		}
	}
}

func TestPollerRecordsPublishFailure(t *testing.T) {
	store := &memoryStore{event: Event{ID: uuid.New(), Type: "poison", Payload: json.RawMessage(`{}`), CreatedAt: time.Now()}}
	publisher := &recordingPublisher{err: errors.New("invalid event")}
	NewPoller(store, publisher, time.Second, 1).drain(context.Background())
	if !store.failed || store.published {
		t.Fatalf("failed=%v published=%v, want recorded failure only", store.failed, store.published)
	}
}

func TestPollerForwardsPersistedCorrelationID(t *testing.T) {
	store := &memoryStore{event: Event{ID: uuid.New(), Type: "test", Payload: json.RawMessage(`{}`), CreatedAt: time.Now(), CorrelationID: "request-789"}}
	publisher := &recordingPublisher{}
	NewPoller(store, publisher, time.Second, 1).drain(context.Background())
	if len(publisher.events) != 1 || publisher.events[0].CorrelationID != "request-789" {
		t.Fatalf("published events = %+v", publisher.events)
	}
}

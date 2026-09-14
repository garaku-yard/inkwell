package projectevents

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	"inkwell/server/pkg/events"
)

type cleanerStub struct {
	projects []uuid.UUID
}

func (s *cleanerStub) DeleteProjectData(_ context.Context, projectID uuid.UUID) error {
	s.projects = append(s.projects, projectID)
	return nil
}

func TestProjectDeletedRedeliveryIsSafe(t *testing.T) {
	projectID := uuid.New()
	payload, _ := json.Marshal(map[string]string{"project_id": projectID.String()})
	message, _ := json.Marshal(events.Event{ID: uuid.NewString(), Type: events.EventTypeProjectDeleted, Payload: payload})
	cleaner := &cleanerStub{}
	processor := NewProcessor(cleaner)

	if err := processor.Process(context.Background(), message); err != nil {
		t.Fatal(err)
	}
	if err := processor.Process(context.Background(), message); err != nil {
		t.Fatal(err)
	}
	if len(cleaner.projects) != 2 || cleaner.projects[0] != projectID || cleaner.projects[1] != projectID {
		t.Fatalf("cleanup calls = %v, want two calls for %s", cleaner.projects, projectID)
	}
}

func TestProjectDeletedAcceptsOutboxBase64Payload(t *testing.T) {
	projectID := uuid.New()
	payload, _ := json.Marshal(map[string]string{"project_id": projectID.String()})
	message, _ := json.Marshal(events.Event{ID: uuid.NewString(), Type: events.EventTypeProjectDeleted, Payload: mustJSON(payload)})
	cleaner := &cleanerStub{}
	if err := NewProcessor(cleaner).Process(context.Background(), message); err != nil {
		t.Fatal(err)
	}
	if len(cleaner.projects) != 1 || cleaner.projects[0] != projectID {
		t.Fatalf("cleanup calls = %v, want %s", cleaner.projects, projectID)
	}
}

func mustJSON(value []byte) json.RawMessage {
	b, _ := json.Marshal(value)
	return b
}

package projectevents

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"inkwell/server/pkg/events"
)

type ProjectCleaner interface {
	DeleteProjectData(ctx context.Context, projectID uuid.UUID) error
}

type Processor struct {
	cleaner ProjectCleaner
}

func NewProcessor(cleaner ProjectCleaner) *Processor {
	return &Processor{cleaner: cleaner}
}

// Process handles one shared event envelope. Unknown project events are safe
// to commit; project.deleted is committed only after idempotent local cleanup.
func (p *Processor) Process(ctx context.Context, message []byte) error {
	var event events.Event
	if err := json.Unmarshal(message, &event); err != nil {
		return fmt.Errorf("decode project event envelope: %w", err)
	}
	if event.Type != events.EventTypeProjectDeleted {
		return nil
	}

	payload := event.Payload
	// Current outbox publication may encode its stored JSON bytes as a base64
	// JSON string. Accept both that shape and the normal object shape during the
	// rollout; #363 will make the envelope contract uniform.
	if len(payload) > 0 && payload[0] == '"' {
		var encoded string
		if err := json.Unmarshal(payload, &encoded); err != nil {
			return fmt.Errorf("decode project.deleted payload string: %w", err)
		}
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return fmt.Errorf("decode project.deleted payload base64: %w", err)
		}
		payload = decoded
	}

	var body struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(payload, &body); err != nil {
		return fmt.Errorf("decode project.deleted payload: %w", err)
	}
	projectID, err := uuid.Parse(body.ProjectID)
	if err != nil {
		return fmt.Errorf("invalid project.deleted project_id: %w", err)
	}
	return p.cleaner.DeleteProjectData(ctx, projectID)
}

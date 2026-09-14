// Package events defines the event publishing interface and shared event types used
// across Inkwell microservices. Service layers depend on Publisher, never on a
// concrete transport, so tests can use NoopPublisher without a running Kafka broker.
package events

import (
	"context"
	"encoding/json"
	"time"

	"inkwell/server/pkg/grpcmeta"
)

// Publisher is the single interface that all services use to emit domain events.
// Implementations: KafkaPublisher (production), NoopPublisher (tests / local dev).
type Publisher interface {
	// Publish serialises payload to JSON and sends it to the appropriate topic.
	// eventType must be one of the EventType* constants defined in this package.
	Publish(ctx context.Context, eventType string, payload any) error
}

// EnvelopePublisher publishes a prebuilt event envelope. Outbox publishers use
// this extension so retries retain the logical event ID assigned at enqueue.
// Publisher remains unchanged for service callers and third-party test doubles.
type EnvelopePublisher interface {
	PublishEvent(ctx context.Context, event Event) error
}

// PublishEvent preserves event when publisher supports envelopes, and falls
// back to the original Publisher contract for legacy implementations.
func PublishEvent(ctx context.Context, publisher Publisher, event Event) error {
	if event.CorrelationID == "" {
		event.CorrelationID = grpcmeta.CorrelationID(ctx)
	}
	if p, ok := publisher.(EnvelopePublisher); ok {
		return p.PublishEvent(ctx, event)
	}
	return publisher.Publish(ctx, event.Type, event.Payload)
}

// Event is the envelope written to Kafka. Every message has the same shape so
// consumers can route on Type without deserialising Payload.
type Event struct {
	// ID is a unique identifier for this event (UUID).
	ID string `json:"id"`
	// Type is one of the EventType* constants (e.g. "user.created").
	Type string `json:"type"`
	// OccurredAt is the wall-clock time the event was emitted.
	OccurredAt time.Time `json:"occurred_at"`
	// Payload contains the event-specific data.
	Payload       json.RawMessage `json:"payload"`
	CorrelationID string          `json:"correlation_id,omitempty"`
	CausationID   string          `json:"causation_id,omitempty"`
}

// Event type constants — the canonical strings that travel on the wire.
const (
	EventTypeUserCreated    = "user.created"
	EventTypeUserUpdated    = "user.updated"
	EventTypeProjectCreated = "project.created"
	EventTypeProjectUpdated = "project.updated"
	EventTypeProjectDeleted = "project.deleted"
	EventTypeCollabAdded    = "collaboration.added"
	EventTypeCollabRemoved  = "collaboration.removed"
	EventTypeCollabInvited  = "collaboration.invited"
	EventTypeBillingUpdated = "billing.updated"
	EventTypeCommentAdded   = "comment.added"
)

// Topic returns the Kafka topic for a given event type.
// All events of a domain family share one topic so consumers can subscribe broadly.
func Topic(eventType string) string {
	switch {
	case len(eventType) >= 4 && eventType[:4] == "user":
		return "user-events"
	case len(eventType) >= 7 && eventType[:7] == "project":
		return "project-events"
	case len(eventType) >= 13 && eventType[:13] == "collaboration":
		return "collab-events"
	case len(eventType) >= 7 && eventType[:7] == "comment":
		// Comments are a collaboration-service concern; group them on the
		// collab topic so the same consumer subscription covers them.
		return "collab-events"
	case len(eventType) >= 7 && eventType[:7] == "billing":
		return "billing-events"
	default:
		return "misc-events"
	}
}

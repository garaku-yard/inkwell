// Package events defines the event publishing interface and shared event types used
// across Scriptlith microservices. Service layers depend on Publisher, never on a
// concrete transport, so tests can use NoopPublisher without a running Kafka broker.
package events

import (
	"context"
	"encoding/json"
	"time"
)

// Publisher is the single interface that all services use to emit domain events.
// Implementations: KafkaPublisher (production), NoopPublisher (tests / local dev).
type Publisher interface {
	// Publish serialises payload to JSON and sends it to the appropriate topic.
	// eventType must be one of the EventType* constants defined in this package.
	Publish(ctx context.Context, eventType string, payload any) error
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
	Payload json.RawMessage `json:"payload"`
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
	case len(eventType) >= 7 && eventType[:7] == "billing":
		return "billing-events"
	default:
		return "misc-events"
	}
}

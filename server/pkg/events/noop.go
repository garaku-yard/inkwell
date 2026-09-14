package events

import "context"

// NoopPublisher discards all events. Use it in unit tests and local dev
// environments where Kafka is not available.
type NoopPublisher struct{}

// Publish satisfies the Publisher interface and does nothing.
func (n *NoopPublisher) Publish(_ context.Context, _ string, _ any) error {
	return nil
}

// PublishEvent satisfies EnvelopePublisher and preserves compatibility with
// callers that publish stable outbox envelopes.
func (n *NoopPublisher) PublishEvent(_ context.Context, _ Event) error { return nil }

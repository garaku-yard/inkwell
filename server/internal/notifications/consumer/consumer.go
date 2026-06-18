// Package consumer wires the notifications service to Kafka. It is the first
// consumer in the system (every other service is producer-only), so it owns
// its own reader rather than reusing the unused legacy pkg/kafka.Consumer.
//
// Delivery model: explicit-commit at-least-once. A message is committed only
// after Process returns nil, so a crash mid-process re-delivers rather than
// drops. Process is idempotent (delivery-log dedup), so re-delivery — and the
// producer's inherent double-publish — is harmless. We start from the earliest
// offset (FirstOffset) so a freshly-provisioned consumer group still sees
// events that were published before it first connected.
package consumer

import (
	"context"
	"encoding/json"
	"log/slog"

	kafkago "github.com/segmentio/kafka-go"

	"inkwell/server/pkg/events"
)

// Processor handles a single decoded domain event. The notifications service
// implements this.
type Processor interface {
	Process(ctx context.Context, evt events.Event) error
}

// Consumer reads domain events from Kafka and hands each to a Processor.
type Consumer struct {
	reader *kafkago.Reader
	proc   Processor
	log    *slog.Logger
}

// New builds a Consumer subscribed to the given topics under a single consumer
// group. Pass the topics produced by events.Topic (e.g. "collab-events").
func New(brokers, topics []string, groupID string, proc Processor) *Consumer {
	reader := kafkago.NewReader(kafkago.ReaderConfig{
		Brokers:     brokers,
		GroupID:     groupID,
		GroupTopics: topics,
		MinBytes:    1,
		MaxBytes:    10e6,
		StartOffset: kafkago.FirstOffset,
	})
	return &Consumer{
		reader: reader,
		proc:   proc,
		log:    slog.Default().With("component", "notifications_consumer"),
	}
}

// Run blocks consuming messages until ctx is cancelled. It logs and skips
// malformed messages (committing them so they don't wedge the partition) and
// retries Process failures by leaving the offset uncommitted.
func (c *Consumer) Run(ctx context.Context) {
	c.log.Info("consumer started", "topics", c.reader.Config().GroupTopics, "group", c.reader.Config().GroupID)
	for {
		m, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return // shutting down
			}
			c.log.Error("fetch message failed", "error", err)
			continue
		}

		if c.deliver(ctx, m) {
			if err := c.reader.CommitMessages(ctx, m); err != nil && ctx.Err() == nil {
				c.log.Error("commit failed", "error", err, "offset", m.Offset)
			}
		}
	}
}

// deliver decodes and processes one message. It returns true when the offset
// should be committed: on success, and on a poison (undecodable) message so a
// single bad event can't block the partition forever. A Process error returns
// false so the message is retried (the producer also re-publishes the same
// event ~10s later via the outbox poller, giving a second natural attempt).
func (c *Consumer) deliver(ctx context.Context, m kafkago.Message) bool {
	var evt events.Event
	if err := json.Unmarshal(m.Value, &evt); err != nil {
		c.log.Error("skipping undecodable message", "error", err, "offset", m.Offset)
		return true
	}
	if err := c.proc.Process(ctx, evt); err != nil {
		c.log.Error("process failed; will retry", "error", err, "type", evt.Type, "event_id", evt.ID)
		return false
	}
	return true
}

// Close releases the underlying reader.
func (c *Consumer) Close() error {
	return c.reader.Close()
}

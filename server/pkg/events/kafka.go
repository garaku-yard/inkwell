package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	kafkago "github.com/segmentio/kafka-go"

	"inkwell/server/pkg/grpcmeta"
)

// KafkaPublisher implements Publisher using segmentio/kafka-go.
// One writer is created per topic on first use (lazy init via writerFor).
//
// Publish is called concurrently from request handlers (the inline best-effort
// publish path) and from each service's background outbox poller, so the writer
// cache is guarded by mu.
type KafkaPublisher struct {
	brokers []string

	mu      sync.RWMutex
	writers map[string]*kafkago.Writer
}

// NewKafkaPublisher returns a KafkaPublisher connected to the given brokers.
func NewKafkaPublisher(brokers []string) *KafkaPublisher {
	return &KafkaPublisher{
		brokers: brokers,
		writers: make(map[string]*kafkago.Writer),
	}
}

// Publish serialises payload to JSON, wraps it in an Event envelope, and writes
// it to the topic that corresponds to eventType.
func (p *KafkaPublisher) Publish(ctx context.Context, eventType string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("events: marshal payload: %w", err)
	}

	return p.PublishEvent(ctx, Event{
		ID:            uuid.New().String(),
		Type:          eventType,
		OccurredAt:    time.Now().UTC(),
		Payload:       json.RawMessage(raw),
		CorrelationID: grpcmeta.CorrelationID(ctx),
	})
}

// PublishEvent writes an existing envelope without replacing its stable ID.
func (p *KafkaPublisher) PublishEvent(ctx context.Context, env Event) error {
	if env.ID == "" {
		env.ID = uuid.New().String()
	}
	if env.OccurredAt.IsZero() {
		env.OccurredAt = time.Now().UTC()
	}

	body, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("events: marshal envelope: %w", err)
	}

	topic := Topic(env.Type)
	writer := p.writerFor(topic)

	msg := kafkago.Message{
		Key:   []byte(env.ID),
		Value: body,
		Time:  env.OccurredAt,
	}

	if err := writer.WriteMessages(ctx, msg); err != nil {
		return fmt.Errorf("events: write to topic %s: %w", topic, err)
	}

	slog.Info("event published", "event_type", env.Type, "event_id", env.ID, "correlation_id", env.CorrelationID, "causation_id", env.CausationID, "topic", topic)
	return nil
}

// Close flushes and closes all open writers. Call on service shutdown, after
// the outbox poller has stopped so no Publish can race writerFor.
func (p *KafkaPublisher) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	var firstErr error
	for topic, w := range p.writers {
		if err := w.Close(); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("events: close writer for %s: %w", topic, err)
		}
	}
	return firstErr
}

func (p *KafkaPublisher) writerFor(topic string) *kafkago.Writer {
	p.mu.RLock()
	w, ok := p.writers[topic]
	p.mu.RUnlock()
	if ok {
		return w
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	// Re-check: another goroutine may have created the writer between the
	// RUnlock above and acquiring the write lock.
	if w, ok := p.writers[topic]; ok {
		return w
	}
	w = &kafkago.Writer{
		Addr:         kafkago.TCP(p.brokers...),
		Topic:        topic,
		Balancer:     &kafkago.LeastBytes{},
		RequiredAcks: kafkago.RequireOne,
		Async:        false,
	}
	p.writers[topic] = w
	return w
}

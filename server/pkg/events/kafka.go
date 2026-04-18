package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	kafkago "github.com/segmentio/kafka-go"
)

// KafkaPublisher implements Publisher using segmentio/kafka-go.
// One writer is created per topic on first use (lazy init via writerFor).
type KafkaPublisher struct {
	brokers []string
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

	env := Event{
		ID:         uuid.New().String(),
		Type:       eventType,
		OccurredAt: time.Now().UTC(),
		Payload:    json.RawMessage(raw),
	}

	body, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("events: marshal envelope: %w", err)
	}

	topic := Topic(eventType)
	writer := p.writerFor(topic)

	msg := kafkago.Message{
		Key:   []byte(env.ID),
		Value: body,
		Time:  env.OccurredAt,
	}

	if err := writer.WriteMessages(ctx, msg); err != nil {
		return fmt.Errorf("events: write to topic %s: %w", topic, err)
	}

	slog.Info("event published", "type", eventType, "id", env.ID, "topic", topic)
	return nil
}

// Close flushes and closes all open writers. Call on service shutdown.
func (p *KafkaPublisher) Close() error {
	var firstErr error
	for topic, w := range p.writers {
		if err := w.Close(); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("events: close writer for %s: %w", topic, err)
		}
	}
	return firstErr
}

func (p *KafkaPublisher) writerFor(topic string) *kafkago.Writer {
	if w, ok := p.writers[topic]; ok {
		return w
	}
	w := &kafkago.Writer{
		Addr:         kafkago.TCP(p.brokers...),
		Topic:        topic,
		Balancer:     &kafkago.LeastBytes{},
		RequiredAcks: kafkago.RequireOne,
		Async:        false,
	}
	p.writers[topic] = w
	return w
}

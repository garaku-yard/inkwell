package kafka

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/segmentio/kafka-go"
)

type Producer struct {
	writer *kafka.Writer
}

type Consumer struct {
	reader *kafka.Reader
}

type Config struct {
	Brokers []string
	Topic   string
	GroupID string
}

func NewConfigFromEnv() *Config {
	// You can extend this to read from environment variables
	return &Config{
		Brokers: []string{"localhost:9092"}, // Default for local development
	}
}

func NewProducer(brokers []string, topic string) *Producer {
	writer := &kafka.Writer{
		Addr:         kafka.TCP(brokers...),
		Topic:        topic,
		Balancer:     &kafka.LeastBytes{},
		RequiredAcks: kafka.RequireOne,
		Async:        false,
	}

	return &Producer{writer: writer}
}

func (p *Producer) SendMessage(ctx context.Context, key, value string) error {
	msg := kafka.Message{
		Key:   []byte(key),
		Value: []byte(value),
		Time:  time.Now(),
	}

	err := p.writer.WriteMessages(ctx, msg)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	log.Printf("Message sent to topic %s: key=%s", p.writer.Topic, key)
	return nil
}

func (p *Producer) Close() error {
	return p.writer.Close()
}

func NewConsumer(brokers []string, topic, groupID string) *Consumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokers,
		Topic:          topic,
		GroupID:        groupID,
		MinBytes:       10e3, // 10KB
		MaxBytes:       10e6, // 10MB
		CommitInterval: time.Second,
		StartOffset:    kafka.LastOffset,
	})

	return &Consumer{reader: reader}
}

func (c *Consumer) ReadMessage(ctx context.Context) (kafka.Message, error) {
	msg, err := c.reader.ReadMessage(ctx)
	if err != nil {
		return kafka.Message{}, fmt.Errorf("failed to read message: %w", err)
	}

	log.Printf("Message received from topic %s: key=%s, partition=%d, offset=%d",
		msg.Topic, string(msg.Key), msg.Partition, msg.Offset)

	return msg, nil
}

func (c *Consumer) Close() error {
	return c.reader.Close()
}

// Event types for the screenplay application
const (
	EventTypeUserCreated    = "user.created"
	EventTypeUserUpdated    = "user.updated"
	EventTypeProjectCreated = "project.created"
	EventTypeProjectUpdated = "project.updated"
	EventTypeProjectDeleted = "project.deleted"
	EventTypeScriptUpdated  = "script.updated"
	EventTypeCommentAdded   = "comment.added"
	EventTypeCollabAdded    = "collaboration.added"
	EventTypeCollabRemoved  = "collaboration.removed"
	EventTypeBillingUpdated = "billing.updated"
)

// Topic names
const (
	TopicUserEvents    = "user-events"
	TopicProjectEvents = "project-events"
	TopicScriptEvents  = "script-events"
	TopicCollabEvents  = "collab-events"
	TopicBillingEvents = "billing-events"
)

func GetTopicForEvent(eventType string) string {
	switch {
	case strings.HasPrefix(eventType, "user."):
		return TopicUserEvents
	case strings.HasPrefix(eventType, "project."):
		return TopicProjectEvents
	case strings.HasPrefix(eventType, "script."):
		return TopicScriptEvents
	case strings.HasPrefix(eventType, "collaboration."):
		return TopicCollabEvents
	case strings.HasPrefix(eventType, "billing."):
		return TopicBillingEvents
	default:
		return "unknown-events"
	}
}

// Package config loads the Billing service configuration from environment variables.
package config

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"inkwell/server/pkg/env"
)

// Config holds all configuration for the Billing service.
type Config struct {
	GRPCPort       string
	DatabaseConfig DatabaseConfig
	KafkaConfig    KafkaConfig
	PaddleConfig   PaddleConfig
	RedisConfig    RedisConfig
}

// RedisConfig holds the Redis connection used for the live usage counters that
// keep managed-AI metering off the database hot path. Empty Host disables Redis;
// the service then falls back to summing usage_events directly (correct but
// heavier), so the feature degrades gracefully.
type RedisConfig struct {
	Host     string
	Port     string
	Password string
}

// Enabled reports whether Redis is configured.
func (r RedisConfig) Enabled() bool { return r.Host != "" }

// PaddleConfig holds the Paddle Billing integration settings. The whole feature
// is inert until APIKey is set ("build now, plug credentials later") — Configured
// reports that state, and callers must check it before offering checkout.
type PaddleConfig struct {
	// APIKey authenticates calls to the Paddle API. Empty ⇒ Paddle disabled.
	APIKey string
	// WebhookSecret verifies inbound webhook signatures.
	WebhookSecret string
	// Environment selects the Paddle host: "production" or anything else ⇒ sandbox.
	Environment string
	// PriceMap maps a tier slug to its Paddle price id (pri_…), parsed from the
	// PADDLE_PRICE_MAP env var as a JSON object.
	PriceMap map[string]string
}

// Configured reports whether Paddle credentials are present. When false the
// billing service refuses checkout and ignores webhooks.
func (p PaddleConfig) Configured() bool {
	return p.APIKey != "" && p.WebhookSecret != "" && len(p.PriceMap) > 0
}

func (p PaddleConfig) validate() error {
	if p.APIKey == "" && p.WebhookSecret == "" && len(p.PriceMap) == 0 {
		return nil
	}
	if p.APIKey == "" || p.WebhookSecret == "" || len(p.PriceMap) == 0 {
		return fmt.Errorf("Paddle configuration is incomplete: PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, and PADDLE_PRICE_MAP must be set together")
	}
	if p.Environment != "sandbox" && p.Environment != "production" {
		return fmt.Errorf("PADDLE_ENVIRONMENT must be sandbox or production")
	}
	for key, priceID := range p.PriceMap {
		if strings.TrimSpace(key) == "" || !strings.HasPrefix(priceID, "pri_") {
			return fmt.Errorf("PADDLE_PRICE_MAP entry %q must contain a Paddle price id beginning with pri_", key)
		}
	}
	return nil
}

// DatabaseConfig holds database connection settings for the billing DB.
type DatabaseConfig struct {
	Host            string
	Port            string
	User            string
	Password        string
	Name            string
	SSLMode         string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

// KafkaConfig holds Kafka broker settings for event publishing.
type KafkaConfig struct {
	Brokers []string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	maxOpen, _ := strconv.Atoi(env.String("BILLING_DB_MAX_OPEN_CONNS", "25"))
	maxIdle, _ := strconv.Atoi(env.String("BILLING_DB_MAX_IDLE_CONNS", "10"))
	lifetime, _ := time.ParseDuration(env.String("BILLING_DB_CONN_MAX_LIFETIME", "1h"))

	brokers := []string{}
	if b := env.String("KAFKA_BROKERS", ""); b != "" {
		brokers = []string{b}
	}

	priceMap := map[string]string{}
	if raw := env.String("PADDLE_PRICE_MAP", ""); raw != "" {
		if err := json.Unmarshal([]byte(raw), &priceMap); err != nil {
			return nil, fmt.Errorf("parse PADDLE_PRICE_MAP: %w", err)
		}
	}

	cfg := &Config{
		GRPCPort:    env.String("BILLING_GRPC_PORT", "50054"),
		KafkaConfig: KafkaConfig{Brokers: brokers},
		PaddleConfig: PaddleConfig{
			APIKey:        env.String("PADDLE_API_KEY", ""),
			WebhookSecret: env.String("PADDLE_WEBHOOK_SECRET", ""),
			Environment:   env.String("PADDLE_ENVIRONMENT", "sandbox"),
			PriceMap:      priceMap,
		},
		RedisConfig: RedisConfig{
			Host:     env.String("REDIS_HOST", ""),
			Port:     env.String("REDIS_PORT", "6379"),
			Password: env.String("REDIS_PASSWORD", ""),
		},
		DatabaseConfig: DatabaseConfig{
			Host:            env.String("BILLING_DB_HOST", "localhost"),
			Port:            env.String("BILLING_DB_PORT", "5432"),
			User:            env.String("BILLING_DB_USER", "postgres"),
			Password:        env.String("BILLING_DB_PASSWORD", ""),
			Name:            env.String("BILLING_DB_NAME", "billing_db"),
			SSLMode:         env.String("BILLING_DB_SSLMODE", "disable"),
			MaxOpenConns:    maxOpen,
			MaxIdleConns:    maxIdle,
			ConnMaxLifetime: lifetime,
		},
	}
	if err := cfg.PaddleConfig.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

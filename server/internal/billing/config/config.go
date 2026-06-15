// Package config loads the Billing service configuration from environment variables.
package config

import (
	"strconv"
	"time"

	"inkwell/server/pkg/env"
)

// Config holds all configuration for the Billing service.
type Config struct {
	GRPCPort       string
	DatabaseConfig DatabaseConfig
	KafkaConfig    KafkaConfig
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

	return &Config{
		GRPCPort:    env.String("BILLING_GRPC_PORT", "50054"),
		KafkaConfig: KafkaConfig{Brokers: brokers},
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
	}, nil
}

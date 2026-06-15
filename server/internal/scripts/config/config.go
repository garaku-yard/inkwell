package config

import (
	"time"

	"inkwell/server/pkg/env"
)

// Config holds all configuration for the Scripts service
type Config struct {
	// Server configuration
	GRPCPort string

	// Database configuration
	DatabaseConfig DatabaseConfig

	// Identity Service configuration (for user validation)
	IdentityConfig IdentityConfig

	// Billing Service configuration (for quota checks and usage tracking)
	BillingConfig BillingConfig

	// Kafka configuration
	KafkaConfig KafkaConfig

	// Storage configuration (for file uploads if needed)
	StorageConfig StorageConfig
}

// DatabaseConfig holds database connection settings
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

// IdentityConfig holds settings for connecting to Identity Service
type IdentityConfig struct {
	Host string
	Port string
}

// BillingConfig holds settings for connecting to the Billing Service. Used by
// the scripts service to enforce per-tier quotas (projects, collaborators, etc.)
// and report usage back. Leave the host empty to disable quota enforcement in
// environments where billing is not running.
type BillingConfig struct {
	Host string
	Port string
}

// KafkaConfig holds Kafka connection settings
type KafkaConfig struct {
	Brokers       []string
	TopicPrefix   string
	ConsumerGroup string
}

// StorageConfig holds file storage settings
type StorageConfig struct {
	Type       string // "local", "s3", "gcs"
	LocalPath  string
	BucketName string
}

// Load loads configuration from environment variables with defaults
func Load() (*Config, error) {
	cfg := &Config{
		GRPCPort: env.String("SCRIPTS_GRPC_PORT", "50052"),
		DatabaseConfig: DatabaseConfig{
			Host:            env.String("SCRIPTS_DB_HOST", "localhost"),
			Port:            env.String("SCRIPTS_DB_PORT", "5432"),
			User:            env.String("SCRIPTS_DB_USER", "postgres"),
			Password:        env.String("SCRIPTS_DB_PASSWORD", ""),
			Name:            env.String("SCRIPTS_DB_NAME", "scripts_db"),
			SSLMode:         env.String("SCRIPTS_DB_SSLMODE", "disable"),
			MaxOpenConns:    env.Int("SCRIPTS_DB_MAX_OPEN_CONNS", 25),
			MaxIdleConns:    env.Int("SCRIPTS_DB_MAX_IDLE_CONNS", 10),
			ConnMaxLifetime: env.Duration("SCRIPTS_DB_CONN_MAX_LIFETIME", time.Hour),
		},
		IdentityConfig: IdentityConfig{
			Host: env.String("IDENTITY_SERVICE_HOST", "localhost"),
			Port: env.String("IDENTITY_SERVICE_PORT", "50051"),
		},
		BillingConfig: BillingConfig{
			Host: env.String("BILLING_SERVICE_HOST", "localhost"),
			Port: env.String("BILLING_SERVICE_PORT", "50054"),
		},
		KafkaConfig: KafkaConfig{
			Brokers:       []string{env.String("KAFKA_BROKERS", "localhost:9092")},
			TopicPrefix:   env.String("KAFKA_TOPIC_PREFIX", "inkwell"),
			ConsumerGroup: env.String("KAFKA_CONSUMER_GROUP", "scripts-service"),
		},
		StorageConfig: StorageConfig{
			Type:       env.String("STORAGE_TYPE", "local"),
			LocalPath:  env.String("STORAGE_LOCAL_PATH", "./uploads"),
			BucketName: env.String("STORAGE_BUCKET_NAME", "inkwell-files"),
		},
	}

	return cfg, nil
}

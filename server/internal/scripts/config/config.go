package config

import (
	"time"

	"inkwell/server/pkg/env"
)

// Config holds all configuration for the Scripts service
type Config struct {
	// Server configuration
	GRPCPort string `env:"GRPC_PORT" default:"50052"`

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
	Host            string        `env:"SCRIPTS_DB_HOST" default:"localhost"`
	Port            string        `env:"SCRIPTS_DB_PORT" default:"5432"`
	User            string        `env:"SCRIPTS_DB_USER" default:"postgres"`
	Password        string        `env:"SCRIPTS_DB_PASSWORD" default:""`
	Name            string        `env:"SCRIPTS_DB_NAME" default:"scripts_db"`
	SSLMode         string        `env:"SCRIPTS_DB_SSLMODE" default:"disable"`
	MaxOpenConns    int           `env:"SCRIPTS_DB_MAX_OPEN_CONNS" default:"25"`
	MaxIdleConns    int           `env:"SCRIPTS_DB_MAX_IDLE_CONNS" default:"10"`
	ConnMaxLifetime time.Duration `env:"SCRIPTS_DB_CONN_MAX_LIFETIME" default:"1h"`
}

// IdentityConfig holds settings for connecting to Identity Service
type IdentityConfig struct {
	Host string `env:"IDENTITY_SERVICE_HOST" default:"localhost"`
	Port string `env:"IDENTITY_SERVICE_PORT" default:"50051"`
}

// BillingConfig holds settings for connecting to the Billing Service. Used by
// the scripts service to enforce per-tier quotas (projects, collaborators, etc.)
// and report usage back. Leave the host empty to disable quota enforcement in
// environments where billing is not running.
type BillingConfig struct {
	Host string `env:"BILLING_SERVICE_HOST" default:"localhost"`
	Port string `env:"BILLING_SERVICE_PORT" default:"50054"`
}

// KafkaConfig holds Kafka connection settings
type KafkaConfig struct {
	Brokers       []string `env:"KAFKA_BROKERS" default:"localhost:9092"`
	TopicPrefix   string   `env:"KAFKA_TOPIC_PREFIX" default:"inkwell"`
	ConsumerGroup string   `env:"KAFKA_CONSUMER_GROUP" default:"scripts-service"`
}

// StorageConfig holds file storage settings
type StorageConfig struct {
	Type       string `env:"STORAGE_TYPE" default:"local"` // "local", "s3", "gcs"
	LocalPath  string `env:"STORAGE_LOCAL_PATH" default:"./uploads"`
	BucketName string `env:"STORAGE_BUCKET_NAME" default:"inkwell-files"`
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

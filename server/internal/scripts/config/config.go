package config

import (
	"os"
	"strconv"
	"time"
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
		GRPCPort: getEnvOrDefault("SCRIPTS_GRPC_PORT", "50052"),
		DatabaseConfig: DatabaseConfig{
			Host:            getEnvOrDefault("SCRIPTS_DB_HOST", "localhost"),
			Port:            getEnvOrDefault("SCRIPTS_DB_PORT", "5432"),
			User:            getEnvOrDefault("SCRIPTS_DB_USER", "postgres"),
			Password:        getEnvOrDefault("SCRIPTS_DB_PASSWORD", ""),
			Name:            getEnvOrDefault("SCRIPTS_DB_NAME", "scripts_db"),
			SSLMode:         getEnvOrDefault("SCRIPTS_DB_SSLMODE", "disable"),
			MaxOpenConns:    getEnvIntOrDefault("SCRIPTS_DB_MAX_OPEN_CONNS", 25),
			MaxIdleConns:    getEnvIntOrDefault("SCRIPTS_DB_MAX_IDLE_CONNS", 10),
			ConnMaxLifetime: getEnvDurationOrDefault("SCRIPTS_DB_CONN_MAX_LIFETIME", time.Hour),
		},
		IdentityConfig: IdentityConfig{
			Host: getEnvOrDefault("IDENTITY_SERVICE_HOST", "localhost"),
			Port: getEnvOrDefault("IDENTITY_SERVICE_PORT", "50051"),
		},
		BillingConfig: BillingConfig{
			Host: getEnvOrDefault("BILLING_SERVICE_HOST", "localhost"),
			Port: getEnvOrDefault("BILLING_SERVICE_PORT", "50054"),
		},
		KafkaConfig: KafkaConfig{
			Brokers:       []string{getEnvOrDefault("KAFKA_BROKERS", "localhost:9092")},
			TopicPrefix:   getEnvOrDefault("KAFKA_TOPIC_PREFIX", "inkwell"),
			ConsumerGroup: getEnvOrDefault("KAFKA_CONSUMER_GROUP", "scripts-service"),
		},
		StorageConfig: StorageConfig{
			Type:       getEnvOrDefault("STORAGE_TYPE", "local"),
			LocalPath:  getEnvOrDefault("STORAGE_LOCAL_PATH", "./uploads"),
			BucketName: getEnvOrDefault("STORAGE_BUCKET_NAME", "inkwell-files"),
		},
	}

	return cfg, nil
}

// Helper functions
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvIntOrDefault(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

func getEnvDurationOrDefault(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

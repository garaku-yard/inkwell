package config

import (
	"errors"
	"os"
	"strconv"
	"time"
)

// ErrJWTSecretRequired is returned by Load when ENVIRONMENT is anything other
// than "development" and JWT_SECRET has not been set. It prevents the service
// from starting with the insecure development default in production.
var ErrJWTSecretRequired = errors.New("JWT_SECRET must be set when ENVIRONMENT is not development")

// Config holds all configuration for the Identity service
type Config struct {
	// Server configuration
	GRPCPort string `env:"GRPC_PORT" default:"50051"`

	// Environment ("development", "staging", "production"). Controls whether
	// insecure defaults are tolerated (see ErrJWTSecretRequired).
	Environment string `env:"ENVIRONMENT" default:"development"`

	// Database configuration
	DatabaseConfig DatabaseConfig

	// JWT configuration
	JWTConfig JWTConfig

	// Kafka configuration
	KafkaConfig KafkaConfig

	// Email configuration (for future email verification)
	EmailConfig EmailConfig

	// Security configuration
	SecurityConfig SecurityConfig
}

// DatabaseConfig holds database connection settings
type DatabaseConfig struct {
	Host            string        `env:"IDENTITY_DB_HOST" default:"localhost"`
	Port            string        `env:"IDENTITY_DB_PORT" default:"5432"`
	User            string        `env:"IDENTITY_DB_USER" default:"postgres"`
	Password        string        `env:"IDENTITY_DB_PASSWORD" default:""`
	Name            string        `env:"IDENTITY_DB_NAME" default:"identity_db"`
	SSLMode         string        `env:"IDENTITY_DB_SSLMODE" default:"disable"`
	MaxOpenConns    int           `env:"IDENTITY_DB_MAX_OPEN_CONNS" default:"25"`
	MaxIdleConns    int           `env:"IDENTITY_DB_MAX_IDLE_CONNS" default:"10"`
	ConnMaxLifetime time.Duration `env:"IDENTITY_DB_CONN_MAX_LIFETIME" default:"1h"`
}

// JWTConfig holds JWT token settings. AccessTokenSecret is populated from the
// JWT_SECRET environment variable — a single name is shared with the gateway
// and other services to avoid the same value being set under two keys. There
// is no production default: Load rejects empty secrets outside development.
type JWTConfig struct {
	AccessTokenSecret  string        `env:"JWT_SECRET"`
	AccessTokenExpiry  time.Duration `env:"JWT_ACCESS_EXPIRY" default:"24h"`
	RefreshTokenExpiry time.Duration `env:"JWT_REFRESH_EXPIRY" default:"168h"` // 7 days
	Issuer             string        `env:"JWT_ISSUER" default:"inkwell-identity"`
}

// KafkaConfig holds Kafka connection settings
type KafkaConfig struct {
	Brokers []string `env:"KAFKA_BROKERS" default:"localhost:9092"`
	Topic   string   `env:"KAFKA_USER_TOPIC" default:"user-events"`
}

// EmailConfig holds email service settings
type EmailConfig struct {
	SMTPHost     string `env:"SMTP_HOST" default:""`
	SMTPPort     int    `env:"SMTP_PORT" default:"587"`
	SMTPUsername string `env:"SMTP_USERNAME" default:""`
	SMTPPassword string `env:"SMTP_PASSWORD" default:""`
	FromEmail    string `env:"FROM_EMAIL" default:"noreply@inkwell.com"`
}

// SecurityConfig holds security-related settings
type SecurityConfig struct {
	BcryptCost              int           `env:"BCRYPT_COST" default:"12"`
	MaxLoginAttempts        int           `env:"MAX_LOGIN_ATTEMPTS" default:"5"`
	LoginAttemptWindow      time.Duration `env:"LOGIN_ATTEMPT_WINDOW" default:"15m"`
	PasswordResetExpiry     time.Duration `env:"PASSWORD_RESET_EXPIRY" default:"1h"`
	EmailVerificationExpiry time.Duration `env:"EMAIL_VERIFICATION_EXPIRY" default:"24h"`
}

// Load loads configuration from environment variables. It returns
// ErrJWTSecretRequired when JWT_SECRET is empty and ENVIRONMENT is not set
// to "development" — identity refuses to start with the baked-in dev default
// anywhere else, since tokens it signs would be trivially forgeable.
func Load() (*Config, error) {
	env := getEnvOrDefault("ENVIRONMENT", "development")
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		if env != "development" {
			return nil, ErrJWTSecretRequired
		}
		jwtSecret = "dev-secret-change-me"
	}

	config := &Config{
		GRPCPort:    getEnvOrDefault("IDENTITY_GRPC_PORT", "50051"),
		Environment: env,

		DatabaseConfig: DatabaseConfig{
			Host:            getEnvOrDefault("IDENTITY_DB_HOST", "localhost"),
			Port:            getEnvOrDefault("IDENTITY_DB_PORT", "5432"),
			User:            getEnvOrDefault("IDENTITY_DB_USER", "postgres"),
			Password:        getEnvOrDefault("IDENTITY_DB_PASSWORD", ""),
			Name:            getEnvOrDefault("IDENTITY_DB_NAME", "identity_db"),
			SSLMode:         getEnvOrDefault("IDENTITY_DB_SSLMODE", "disable"),
			MaxOpenConns:    getEnvIntOrDefault("IDENTITY_DB_MAX_OPEN_CONNS", 25),
			MaxIdleConns:    getEnvIntOrDefault("IDENTITY_DB_MAX_IDLE_CONNS", 10),
			ConnMaxLifetime: getEnvDurationOrDefault("IDENTITY_DB_CONN_MAX_LIFETIME", time.Hour),
		},

		JWTConfig: JWTConfig{
			AccessTokenSecret:  jwtSecret,
			AccessTokenExpiry:  getEnvDurationOrDefault("JWT_ACCESS_EXPIRY", 24*time.Hour),
			RefreshTokenExpiry: getEnvDurationOrDefault("JWT_REFRESH_EXPIRY", 168*time.Hour), // 7 days
			Issuer:             getEnvOrDefault("JWT_ISSUER", "inkwell-identity"),
		},

		KafkaConfig: KafkaConfig{
			Brokers: getEnvSliceOrDefault("KAFKA_BROKERS", []string{"localhost:9092"}),
			Topic:   getEnvOrDefault("KAFKA_USER_TOPIC", "user-events"),
		},

		EmailConfig: EmailConfig{
			SMTPHost:     getEnvOrDefault("SMTP_HOST", ""),
			SMTPPort:     getEnvIntOrDefault("SMTP_PORT", 587),
			SMTPUsername: getEnvOrDefault("SMTP_USERNAME", ""),
			SMTPPassword: getEnvOrDefault("SMTP_PASSWORD", ""),
			FromEmail:    getEnvOrDefault("FROM_EMAIL", "noreply@inkwell.com"),
		},

		SecurityConfig: SecurityConfig{
			BcryptCost:              getEnvIntOrDefault("BCRYPT_COST", 12),
			MaxLoginAttempts:        getEnvIntOrDefault("MAX_LOGIN_ATTEMPTS", 5),
			LoginAttemptWindow:      getEnvDurationOrDefault("LOGIN_ATTEMPT_WINDOW", 15*time.Minute),
			PasswordResetExpiry:     getEnvDurationOrDefault("PASSWORD_RESET_EXPIRY", time.Hour),
			EmailVerificationExpiry: getEnvDurationOrDefault("EMAIL_VERIFICATION_EXPIRY", 24*time.Hour),
		},
	}

	return config, nil
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
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
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

func getEnvSliceOrDefault(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		// Split by comma for multiple brokers
		return []string{value} // Simplified for now
	}
	return defaultValue
}

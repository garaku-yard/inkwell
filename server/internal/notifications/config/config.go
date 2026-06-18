package config

import "inkwell/server/pkg/env"

// Config holds the notifications service's runtime configuration. The default
// gRPC port (50058) follows the "newest service gets the next port" convention
// after aisettings (50057).
type Config struct {
	GRPCPort string

	DatabaseConfig DatabaseConfig
}

// DatabaseConfig holds the Postgres connection settings for the notifications
// database. Env vars are prefixed NOTIFICATIONS_DB_*.
type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

// Load reads configuration from the environment, falling back to dev-friendly
// defaults that match docker-compose.yml.
func Load() (*Config, error) {
	return &Config{
		GRPCPort: env.String("GRPC_PORT", "50058"),
		DatabaseConfig: DatabaseConfig{
			Host:     env.String("NOTIFICATIONS_DB_HOST", "localhost"),
			Port:     env.String("NOTIFICATIONS_DB_PORT", "5432"),
			User:     env.String("NOTIFICATIONS_DB_USER", "postgres"),
			Password: env.String("NOTIFICATIONS_DB_PASSWORD", "postgres"),
			Name:     env.String("NOTIFICATIONS_DB_NAME", "notifications_db"),
			SSLMode:  env.String("NOTIFICATIONS_DB_SSLMODE", "disable"),
		},
	}, nil
}

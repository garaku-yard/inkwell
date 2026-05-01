// Package config loads runtime configuration for the ai-settings service.
package config

import (
	"os"
)

// Config is the process-wide runtime config.
type Config struct {
	GRPCPort       string
	EncryptionKey  string // base64 env; decoded to 32 raw bytes at startup
	DatabaseConfig DatabaseConfig
}

// DatabaseConfig is the Postgres connection info.
type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

// Load reads configuration from environment variables, applying defaults
// suited for local development. The encryption key must be set
// explicitly — there is no safe default.
func Load() (*Config, error) {
	return &Config{
		GRPCPort:      getEnv("GRPC_PORT", "50057"),
		EncryptionKey: os.Getenv("AI_ENCRYPTION_KEY"),
		DatabaseConfig: DatabaseConfig{
			Host:     getEnv("AISETTINGS_DB_HOST", "localhost"),
			Port:     getEnv("AISETTINGS_DB_PORT", "5432"),
			User:     getEnv("AISETTINGS_DB_USER", "postgres"),
			Password: getEnv("AISETTINGS_DB_PASSWORD", "postgres"),
			Name:     getEnv("AISETTINGS_DB_NAME", "aisettings_db"),
			SSLMode:  getEnv("AISETTINGS_DB_SSLMODE", "disable"),
		},
	}, nil
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

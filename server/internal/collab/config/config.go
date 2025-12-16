package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	GRPCPort       string
	DatabaseConfig DatabaseConfig
}

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

func Load() (*Config, error) {
	maxOpenConns, _ := strconv.Atoi(getEnvOrDefault("COLLAB_DB_MAX_OPEN_CONNS", "25"))
	maxIdleConns, _ := strconv.Atoi(getEnvOrDefault("COLLAB_DB_MAX_IDLE_CONNS", "10"))
	connMaxLifetime, _ := time.ParseDuration(getEnvOrDefault("COLLAB_DB_CONN_MAX_LIFETIME", "1h"))

	return &Config{
		GRPCPort: getEnvOrDefault("COLLAB_GRPC_PORT", "50053"),
		DatabaseConfig: DatabaseConfig{
			Host:            getEnvOrDefault("COLLAB_DB_HOST", "localhost"),
			Port:            getEnvOrDefault("COLLAB_DB_PORT", "5432"),
			User:            getEnvOrDefault("COLLAB_DB_USER", "postgres"),
			Password:        getEnvOrDefault("COLLAB_DB_PASSWORD", ""),
			Name:            getEnvOrDefault("COLLAB_DB_NAME", "collaboration_db"),
			SSLMode:         getEnvOrDefault("COLLAB_DB_SSLMODE", "disable"),
			MaxOpenConns:    maxOpenConns,
			MaxIdleConns:    maxIdleConns,
			ConnMaxLifetime: connMaxLifetime,
		},
	}, nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

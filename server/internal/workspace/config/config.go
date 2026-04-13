package config

import "os"

type Config struct {
	GRPCPort string

	DatabaseConfig DatabaseConfig
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

func Load() (*Config, error) {
	return &Config{
		GRPCPort: getEnvOrDefault("GRPC_PORT", "50056"),
		DatabaseConfig: DatabaseConfig{
			Host:     getEnvOrDefault("WORKSPACE_DB_HOST", "localhost"),
			Port:     getEnvOrDefault("WORKSPACE_DB_PORT", "5432"),
			User:     getEnvOrDefault("WORKSPACE_DB_USER", "postgres"),
			Password: getEnvOrDefault("WORKSPACE_DB_PASSWORD", "postgres"),
			Name:     getEnvOrDefault("WORKSPACE_DB_NAME", "workspace_db"),
			SSLMode:  getEnvOrDefault("WORKSPACE_DB_SSLMODE", "disable"),
		},
	}, nil
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

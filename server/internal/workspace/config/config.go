package config

import "inkwell/server/pkg/env"

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
		GRPCPort: env.String("GRPC_PORT", "50056"),
		DatabaseConfig: DatabaseConfig{
			Host:     env.String("WORKSPACE_DB_HOST", "localhost"),
			Port:     env.String("WORKSPACE_DB_PORT", "5432"),
			User:     env.String("WORKSPACE_DB_USER", "postgres"),
			Password: env.String("WORKSPACE_DB_PASSWORD", "postgres"),
			Name:     env.String("WORKSPACE_DB_NAME", "workspace_db"),
			SSLMode:  env.String("WORKSPACE_DB_SSLMODE", "disable"),
		},
	}, nil
}

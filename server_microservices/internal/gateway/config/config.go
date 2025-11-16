package config

import (
	"os"
)

// Config holds all configuration for the API Gateway
type Config struct {
	// Server configuration
	Port        string `env:"GATEWAY_PORT" default:"8080"`
	Host        string `env:"GATEWAY_HOST" default:"0.0.0.0"`
	Environment string `env:"ENVIRONMENT" default:"development"`

	// CORS configuration
	AllowedOrigins []string `env:"ALLOWED_ORIGINS" default:"http://localhost:3000"`

	// Service endpoints
	IdentityServiceURL string `env:"IDENTITY_SERVICE_URL" default:"localhost:50051"`
	ScriptsServiceURL  string `env:"SCRIPTS_SERVICE_URL" default:"localhost:50052"`
	CollabServiceURL   string `env:"COLLAB_SERVICE_URL" default:"localhost:50053"`
	BillingServiceURL  string `env:"BILLING_SERVICE_URL" default:"localhost:50054"`
	AIServiceURL       string `env:"AI_SERVICE_URL" default:"localhost:50055"`

	// JWT configuration (for token validation)
	JWTSecret string `env:"JWT_SECRET" default:"dev-gateway-secret"`
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	config := &Config{
		Port:        getEnvOrDefault("GATEWAY_PORT", "8080"),
		Host:        getEnvOrDefault("GATEWAY_HOST", "0.0.0.0"),
		Environment: getEnvOrDefault("ENVIRONMENT", "development"),

		// Service URLs
		IdentityServiceURL: getEnvOrDefault("IDENTITY_SERVICE_URL", "localhost:50051"),
		ScriptsServiceURL:  getEnvOrDefault("SCRIPTS_SERVICE_URL", "localhost:50052"),
		CollabServiceURL:   getEnvOrDefault("COLLAB_SERVICE_URL", "localhost:50053"),
		BillingServiceURL:  getEnvOrDefault("BILLING_SERVICE_URL", "localhost:50054"),
		AIServiceURL:       getEnvOrDefault("AI_SERVICE_URL", "localhost:50055"),

		// JWT
		JWTSecret: getEnvOrDefault("JWT_SECRET", "dev-gateway-secret"),
	}

	// Parse allowed origins
	originsEnv := getEnvOrDefault("ALLOWED_ORIGINS", "http://localhost:3000")
	config.AllowedOrigins = []string{originsEnv} // Simplified for now

	return config, nil
}

// Helper functions
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

package config

import (
	"fmt"
	"os"
	"strings"
)

// Config holds all configuration for the API Gateway
type Config struct {
	// Server configuration
	Port        string `env:"GATEWAY_PORT" default:"8080"`
	Host        string `env:"GATEWAY_HOST" default:"0.0.0.0"`
	Environment string `env:"ENVIRONMENT" default:"development"`

	// CORS configuration
	AllowedOrigins []string `env:"ALLOWED_ORIGINS" default:"http://localhost:3000"`

	// Service configurations
	IdentityService ServiceConfig
	ScriptsService  ServiceConfig
	CollabService   ServiceConfig
	BillingService  ServiceConfig
	AIService       ServiceConfig
	AIChatService   ServiceConfig

	// JWT configuration (for token validation)
	JWTSecret string `env:"JWT_SECRET" default:"dev-gateway-secret"`
}

// ServiceConfig holds configuration for a microservice
type ServiceConfig struct {
	Host string
	Port string
}

// URL returns the full service URL
func (s ServiceConfig) URL() string {
	return fmt.Sprintf("%s:%s", s.Host, s.Port)
}

// Config URL getters
func (c *Config) IdentityServiceURL() string {
	return c.IdentityService.URL()
}

func (c *Config) ScriptsServiceURL() string {
	return c.ScriptsService.URL()
}

func (c *Config) CollaborationServiceURL() string {
	return c.CollabService.URL()
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	config := &Config{
		Port:        getEnvOrDefault("GATEWAY_PORT", "8080"),
		Host:        getEnvOrDefault("GATEWAY_HOST", "0.0.0.0"),
		Environment: getEnvOrDefault("ENVIRONMENT", "development"),
		JWTSecret:   getEnvOrDefault("JWT_SECRET", "dev-gateway-secret"),

		// Service configurations
		IdentityService: ServiceConfig{
			Host: getEnvOrDefault("IDENTITY_SERVICE_HOST", "localhost"),
			Port: getEnvOrDefault("IDENTITY_SERVICE_PORT", "50051"),
		},
		ScriptsService: ServiceConfig{
			Host: getEnvOrDefault("SCRIPTS_SERVICE_HOST", "localhost"),
			Port: getEnvOrDefault("SCRIPTS_SERVICE_PORT", "50052"),
		},
		CollabService: ServiceConfig{
			Host: getEnvOrDefault("COLLAB_SERVICE_HOST", "localhost"),
			Port: getEnvOrDefault("COLLAB_SERVICE_PORT", "50053"),
		},
		BillingService: ServiceConfig{
			Host: getEnvOrDefault("BILLING_SERVICE_HOST", "localhost"),
			Port: getEnvOrDefault("BILLING_SERVICE_PORT", "50054"),
		},
		AIService: ServiceConfig{
			Host: getEnvOrDefault("AI_SERVICE_HOST", "localhost"),
			Port: getEnvOrDefault("AI_SERVICE_PORT", "50055"),
		},
		AIChatService: ServiceConfig{
			Host: getEnvOrDefault("AI_CHAT_SERVICE_HOST", "localhost"),
			Port: getEnvOrDefault("AI_CHAT_SERVICE_PORT", "50054"),
		},
	}

	// Parse allowed origins
	originsEnv := getEnvOrDefault("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
	config.AllowedOrigins = strings.Split(originsEnv, ",")

	return config, nil
}

// Helper functions
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

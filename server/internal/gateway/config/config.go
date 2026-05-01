package config

import (
	"fmt"
	"os"
	"strings"
)

// Config holds all configuration for the API Gateway.
type Config struct {
	// Server configuration
	Port        string `env:"GATEWAY_PORT" default:"8080"`
	Host        string `env:"GATEWAY_HOST" default:"0.0.0.0"`
	Environment string `env:"ENVIRONMENT" default:"development"`

	// CORS configuration
	AllowedOrigins []string `env:"ALLOWED_ORIGINS" default:"http://localhost:3000"`

	// Service configurations
	IdentityService  ServiceConfig
	ScriptsService   ServiceConfig
	CollabService    ServiceConfig
	BillingService   ServiceConfig
	AIService         ServiceConfig
	AIChatService     ServiceConfig
	WorkspaceService  ServiceConfig
	AISettingsService ServiceConfig

	// Redis configuration — used for JWT blocklist and rate limiting
	Redis RedisConfig

	// Rate limiting — requests per minute per IP (0 = disabled).
	// RateLimitRPM applies to every request; AuthRateLimitRPM is a tighter
	// per-IP bucket for credential-heavy endpoints (login, register, password
	// change) so online brute-forcing is uneconomical.
	RateLimitRPM     int `env:"RATE_LIMIT_RPM" default:"120"`
	AuthRateLimitRPM int `env:"AUTH_RATE_LIMIT_RPM" default:"10"`
	AIRateLimitRPM   int `env:"AI_RATE_LIMIT_RPM" default:"30"`

	// OpenAICompatibleHosts allowlists `host[:port]` values that
	// `openai_compatible` provider rows are allowed to dispatch to. Empty
	// (the default) disables the kind on the hosted path entirely; rows
	// can still be created but the gateway refuses to call them. Operators
	// of self-hosted or company-internal Inkwell installs add their LLM
	// endpoints (e.g. `ollama.internal:11434`) here. Match is exact
	// against the URL's Host field — provide entries with the port the
	// users will configure with.
	OpenAICompatibleHosts []string `env:"AI_OPENAI_COMPATIBLE_HOSTS" default:""`
}

// RedisConfig holds Redis connection settings for the gateway.
type RedisConfig struct {
	Host     string `env:"REDIS_HOST" default:"localhost"`
	Port     string `env:"REDIS_PORT" default:"6379"`
	Password string `env:"REDIS_PASSWORD" default:""`
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

func (c *Config) BillingServiceURL() string {
	return c.BillingService.URL()
}

func (c *Config) WorkspaceServiceURL() string {
	return c.WorkspaceService.URL()
}

func (c *Config) AISettingsServiceURL() string {
	return c.AISettingsService.URL()
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	config := &Config{
		Port:        getEnvOrDefault("GATEWAY_PORT", "8080"),
		Host:        getEnvOrDefault("GATEWAY_HOST", "0.0.0.0"),
		Environment: getEnvOrDefault("ENVIRONMENT", "development"),

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
		WorkspaceService: ServiceConfig{
			Host: getEnvOrDefault("WORKSPACE_SERVICE_HOST", "localhost"),
			Port: getEnvOrDefault("WORKSPACE_SERVICE_PORT", "50056"),
		},
		AISettingsService: ServiceConfig{
			Host: getEnvOrDefault("AI_SETTINGS_SERVICE_HOST", "localhost"),
			Port: getEnvOrDefault("AI_SETTINGS_SERVICE_PORT", "50057"),
		},
		Redis: RedisConfig{
			Host:     getEnvOrDefault("REDIS_HOST", "localhost"),
			Port:     getEnvOrDefault("REDIS_PORT", "6379"),
			Password: getEnvOrDefault("REDIS_PASSWORD", ""),
		},
		RateLimitRPM:     getEnvIntOrDefault("RATE_LIMIT_RPM", 120),
		AuthRateLimitRPM: getEnvIntOrDefault("AUTH_RATE_LIMIT_RPM", 10),
		AIRateLimitRPM:   getEnvIntOrDefault("AI_RATE_LIMIT_RPM", 30),
	}

	// Parse allowed origins
	originsEnv := getEnvOrDefault("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
	config.AllowedOrigins = strings.Split(originsEnv, ",")

	// Parse openai_compatible host allowlist. Empty env var means the
	// kind is off on the hosted path; we filter empty entries so a
	// trailing comma doesn't accidentally create an empty allowlist
	// entry that matches a URL whose host couldn't be parsed.
	if hosts := os.Getenv("AI_OPENAI_COMPATIBLE_HOSTS"); hosts != "" {
		for _, h := range strings.Split(hosts, ",") {
			if trimmed := strings.TrimSpace(h); trimmed != "" {
				config.OpenAICompatibleHosts = append(config.OpenAICompatibleHosts, trimmed)
			}
		}
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
		var n int
		if _, err := fmt.Sscanf(value, "%d", &n); err == nil {
			return n
		}
	}
	return defaultValue
}

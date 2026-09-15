package config

import (
	"fmt"
	"os"
	"strings"

	"inkwell/server/pkg/env"
)

// Config holds all configuration for the API Gateway.
type Config struct {
	// Server configuration
	Port        string
	Host        string
	Environment string

	// CORS configuration
	AllowedOrigins []string

	// Service configurations
	IdentityService      ServiceConfig
	ScriptsService       ServiceConfig
	CollabService        ServiceConfig
	BillingService       ServiceConfig
	WorkspaceService     ServiceConfig
	AISettingsService    ServiceConfig
	NotificationsService ServiceConfig

	// Redis configuration — used for JWT blocklist and rate limiting
	Redis RedisConfig

	// Rate limiting — requests per minute per IP (0 = disabled).
	// RateLimitRPM applies to every request; AuthRateLimitRPM is a tighter
	// per-IP bucket for credential-heavy endpoints (login, register, password
	// change) so online brute-forcing is uneconomical.
	RateLimitRPM     int
	AuthRateLimitRPM int
	AIRateLimitRPM   int

	// OpenAICompatibleHosts allowlists `host[:port]` values that
	// `openai_compatible` provider rows are allowed to dispatch to. Empty
	// (the default) disables the kind on the hosted path entirely; rows
	// can still be created but the gateway refuses to call them. Operators
	// of self-hosted or company-internal Inkwell installs add their LLM
	// endpoints (e.g. `ollama.internal:11434`) here. Match is exact
	// against the URL's Host field — provide entries with the port the
	// users will configure with.
	OpenAICompatibleHosts []string

	// ManagedAIProviders holds Inkwell-supplied AI provider keys, keyed by
	// adapter kind ("openai" | "anthropic" | "gemini"). Populated from
	// AI_MANAGED_<KIND>_KEY / _MODEL env vars. Empty (the default) means managed
	// AI is not offered and only BYO providers work — the build-now-plug-later
	// state. Managed usage is metered and capped per the user's tier; BYO is not.
	ManagedAIProviders map[string]ManagedAIProvider
}

// ManagedAIProvider is one Inkwell-supplied AI provider: the API key the gateway
// dispatches with and the default model used when the request names none.
type ManagedAIProvider struct {
	APIKey       string
	DefaultModel string
}

// RedisConfig holds Redis connection settings for the gateway.
type RedisConfig struct {
	Host     string
	Port     string
	Password string
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

func (c *Config) NotificationsServiceURL() string {
	return c.NotificationsService.URL()
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	config := &Config{
		Port:        env.String("GATEWAY_PORT", "8080"),
		Host:        env.String("GATEWAY_HOST", "0.0.0.0"),
		Environment: env.String("ENVIRONMENT", "development"),

		// Service configurations
		IdentityService: ServiceConfig{
			Host: env.String("IDENTITY_SERVICE_HOST", "localhost"),
			Port: env.String("IDENTITY_SERVICE_PORT", "50051"),
		},
		ScriptsService: ServiceConfig{
			Host: env.String("SCRIPTS_SERVICE_HOST", "localhost"),
			Port: env.String("SCRIPTS_SERVICE_PORT", "50052"),
		},
		CollabService: ServiceConfig{
			Host: env.String("COLLAB_SERVICE_HOST", "localhost"),
			Port: env.String("COLLAB_SERVICE_PORT", "50053"),
		},
		BillingService: ServiceConfig{
			Host: env.String("BILLING_SERVICE_HOST", "localhost"),
			Port: env.String("BILLING_SERVICE_PORT", "50054"),
		},
		WorkspaceService: ServiceConfig{
			Host: env.String("WORKSPACE_SERVICE_HOST", "localhost"),
			Port: env.String("WORKSPACE_SERVICE_PORT", "50056"),
		},
		AISettingsService: ServiceConfig{
			Host: env.String("AI_SETTINGS_SERVICE_HOST", "localhost"),
			Port: env.String("AI_SETTINGS_SERVICE_PORT", "50057"),
		},
		NotificationsService: ServiceConfig{
			Host: env.String("NOTIFICATIONS_SERVICE_HOST", "localhost"),
			Port: env.String("NOTIFICATIONS_SERVICE_PORT", "50058"),
		},
		Redis: RedisConfig{
			Host:     env.String("REDIS_HOST", "localhost"),
			Port:     env.String("REDIS_PORT", "6379"),
			Password: env.String("REDIS_PASSWORD", ""),
		},
		RateLimitRPM:     env.Int("RATE_LIMIT_RPM", 120),
		AuthRateLimitRPM: env.Int("AUTH_RATE_LIMIT_RPM", 10),
		AIRateLimitRPM:   env.Int("AI_RATE_LIMIT_RPM", 30),
	}

	// Parse allowed origins
	originsEnv := env.String("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
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

	// Managed AI providers — Inkwell-supplied keys, one per adapter kind. Only
	// kinds with a key set are offered; an empty map means managed AI is off.
	config.ManagedAIProviders = map[string]ManagedAIProvider{}
	for kind, defModel := range map[string]string{
		"openai":    "gpt-4o-mini",
		"anthropic": "claude-haiku-4-5",
		"gemini":    "gemini-3.5-flash-lite",
	} {
		envKind := strings.ToUpper(kind)
		if key := env.String("AI_MANAGED_"+envKind+"_KEY", ""); key != "" {
			config.ManagedAIProviders[kind] = ManagedAIProvider{
				APIKey:       key,
				DefaultModel: env.String("AI_MANAGED_"+envKind+"_MODEL", defModel),
			}
		}
	}

	return config, nil
}

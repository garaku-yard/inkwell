package config

import "inkwell/server/pkg/env"

// Config holds the notifications service's runtime configuration. The default
// gRPC port (50058) follows the "newest service gets the next port" convention
// after aisettings (50057).
type Config struct {
	GRPCPort string

	// AppBaseURL is the public origin used to build absolute links in emails
	// (e.g. https://app.example.com). In-app links stay relative.
	AppBaseURL string

	// IdentityServiceURL is the identity gRPC endpoint used to resolve a
	// user id to an email address for events that carry only UUIDs.
	IdentityServiceURL string

	DatabaseConfig DatabaseConfig
	SMTP           SMTPConfig
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

// SMTPConfig holds the outbound mail relay settings. Host empty disables real
// sending (the mailer logs instead). Env vars are prefixed SMTP_* (FROM_EMAIL
// for the from address, matching the existing identity-service convention).
type SMTPConfig struct {
	Host         string
	Port         string
	Username     string
	Password     string
	From         string
	FromName     string
	ImplicitTLS  bool
	InsecureSkip bool
}

// Load reads configuration from the environment, falling back to dev-friendly
// defaults that match docker-compose.yml.
func Load() (*Config, error) {
	return &Config{
		GRPCPort:           env.String("GRPC_PORT", "50058"),
		AppBaseURL:         env.String("APP_BASE_URL", "http://localhost:3000"),
		IdentityServiceURL: env.String("IDENTITY_SERVICE_HOST", "localhost") + ":" + env.String("IDENTITY_SERVICE_PORT", "50051"),
		DatabaseConfig: DatabaseConfig{
			Host:     env.String("NOTIFICATIONS_DB_HOST", "localhost"),
			Port:     env.String("NOTIFICATIONS_DB_PORT", "5432"),
			User:     env.String("NOTIFICATIONS_DB_USER", "postgres"),
			Password: env.String("NOTIFICATIONS_DB_PASSWORD", "postgres"),
			Name:     env.String("NOTIFICATIONS_DB_NAME", "notifications_db"),
			SSLMode:  env.String("NOTIFICATIONS_DB_SSLMODE", "disable"),
		},
		SMTP: SMTPConfig{
			Host:         env.String("SMTP_HOST", ""),
			Port:         env.String("SMTP_PORT", "587"),
			Username:     env.String("SMTP_USERNAME", ""),
			Password:     env.String("SMTP_PASSWORD", ""),
			From:         env.String("FROM_EMAIL", "noreply@inkwell.app"),
			FromName:     env.String("SMTP_FROM_NAME", "Inkwell"),
			ImplicitTLS:  env.Bool("SMTP_IMPLICIT_TLS", false),
			InsecureSkip: env.Bool("SMTP_INSECURE_SKIP_VERIFY", false),
		},
	}, nil
}

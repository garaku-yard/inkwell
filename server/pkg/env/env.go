// Package env provides small helpers for reading configuration from environment
// variables with a fallback default. Every service's config package used to
// carry its own identical copies of these (getEnvOrDefault / getEnvIntOrDefault
// / getEnvDurationOrDefault); they live here once instead.
package env

import (
	"os"
	"strconv"
	"time"
)

// String returns the value of the environment variable named key, or def if the
// variable is unset or empty.
func String(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Int returns the value of the environment variable named key parsed as an int,
// or def if the variable is unset, empty, or not a valid integer.
func Int(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

// Duration returns the value of the environment variable named key parsed as a
// time.Duration (e.g. "30s", "5m"), or def if the variable is unset, empty, or
// not a valid duration.
func Duration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

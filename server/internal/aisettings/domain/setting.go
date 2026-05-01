// Package domain describes the ai-settings service's core types.
package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// Kind enumerates the provider contracts we recognize. Values match the
// `kind` field on the gRPC wire.
type Kind string

const (
	KindOpenAI           Kind = "openai"
	KindAnthropic        Kind = "anthropic"
	KindGemini           Kind = "gemini"
	KindOpenAICompatible Kind = "openai_compatible"
)

// ValidKind reports whether s is one of the recognized provider kinds.
func ValidKind(s string) bool {
	switch Kind(s) {
	case KindOpenAI, KindAnthropic, KindGemini, KindOpenAICompatible:
		return true
	}
	return false
}

// ProviderSetting is one user-configured BYO provider row.
type ProviderSetting struct {
	ID              uuid.UUID
	UserID          uuid.UUID
	Kind            Kind
	Label           string
	Enabled         bool
	BaseURL         string
	DefaultModel    string
	EncryptedAPIKey []byte
	KeyNonce        []byte
	KeyVersion      int32
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// HasKey reports whether the row has an encrypted key attached.
func (s *ProviderSetting) HasKey() bool {
	return len(s.EncryptedAPIKey) > 0 && len(s.KeyNonce) > 0
}

// Error sentinels returned by the repository and service layers. The
// handler layer translates these into gRPC status codes.
var (
	ErrNotFound     = errors.New("ai provider setting not found")
	ErrInvalidKind  = errors.New("invalid provider kind")
	ErrInvalidInput = errors.New("invalid input")
)

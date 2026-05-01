// Package service owns the ai-settings business logic: input validation,
// id generation, encrypt/decrypt of API keys via pkg/crypto.
package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"inkwell/server/internal/aisettings/domain"
	"inkwell/server/internal/aisettings/repository"
	"inkwell/server/pkg/crypto"
)

// Service is the ai-settings business interface used by the handler.
type Service interface {
	List(ctx context.Context, userID uuid.UUID) ([]domain.ProviderSetting, error)
	Create(ctx context.Context, in CreateInput) (*domain.ProviderSetting, error)
	Update(ctx context.Context, in UpdateInput) (*domain.ProviderSetting, error)
	Delete(ctx context.Context, userID, id uuid.UUID) error
	SetKey(ctx context.Context, userID, id uuid.UUID, apiKey string) error
	ClearKey(ctx context.Context, userID, id uuid.UUID) error
	// GetForDispatch returns the row with the decrypted API key in
	// plaintext. Only the gateway chat handler should call this.
	GetForDispatch(ctx context.Context, userID, id uuid.UUID) (*domain.ProviderSetting, string, error)
}

// CreateInput carries the user-supplied fields for a new row.
type CreateInput struct {
	UserID       uuid.UUID
	Kind         string
	Label        string
	Enabled      bool
	BaseURL      string
	DefaultModel string
}

// UpdateInput carries the metadata fields that Update overwrites.
type UpdateInput struct {
	UserID       uuid.UUID
	ID           uuid.UUID
	Kind         string
	Label        string
	Enabled      bool
	BaseURL      string
	DefaultModel string
}

type service struct {
	repo    repository.SettingRepository
	encKey  []byte
	version int32
}

// New wires up the service with its repository and the master encryption
// key (raw 32 bytes; caller is expected to decode from env via
// crypto.KeyFromEnvBase64).
func New(repo repository.SettingRepository, encKey []byte) (Service, error) {
	if len(encKey) != crypto.KeySize {
		return nil, fmt.Errorf("ai-settings: encryption key must be %d bytes", crypto.KeySize)
	}
	return &service{repo: repo, encKey: encKey, version: 1}, nil
}

func (s *service) List(ctx context.Context, userID uuid.UUID) ([]domain.ProviderSetting, error) {
	return s.repo.List(ctx, userID)
}

func (s *service) Create(ctx context.Context, in CreateInput) (*domain.ProviderSetting, error) {
	if !domain.ValidKind(in.Kind) {
		return nil, domain.ErrInvalidKind
	}
	if in.Label == "" {
		return nil, fmt.Errorf("%w: label required", domain.ErrInvalidInput)
	}
	now := time.Now().UTC()
	row := &domain.ProviderSetting{
		ID:           uuid.New(),
		UserID:       in.UserID,
		Kind:         domain.Kind(in.Kind),
		Label:        in.Label,
		Enabled:      in.Enabled,
		BaseURL:      in.BaseURL,
		DefaultModel: in.DefaultModel,
		KeyVersion:   s.version,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := s.repo.Create(ctx, row); err != nil {
		return nil, err
	}
	return row, nil
}

func (s *service) Update(ctx context.Context, in UpdateInput) (*domain.ProviderSetting, error) {
	if !domain.ValidKind(in.Kind) {
		return nil, domain.ErrInvalidKind
	}
	if in.Label == "" {
		return nil, fmt.Errorf("%w: label required", domain.ErrInvalidInput)
	}
	existing, err := s.repo.Get(ctx, in.UserID, in.ID)
	if err != nil {
		return nil, err
	}
	existing.Kind = domain.Kind(in.Kind)
	existing.Label = in.Label
	existing.Enabled = in.Enabled
	existing.BaseURL = in.BaseURL
	existing.DefaultModel = in.DefaultModel
	existing.UpdatedAt = time.Now().UTC()
	if err := s.repo.UpdateMetadata(ctx, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

func (s *service) Delete(ctx context.Context, userID, id uuid.UUID) error {
	return s.repo.Delete(ctx, userID, id)
}

// associatedData binds a ciphertext to its (user, row) location via GCM
// associated data so cut-and-paste swaps between rows fail to decrypt.
func associatedData(userID, id uuid.UUID) []byte {
	a := userID[:]
	b := id[:]
	out := make([]byte, 0, len(a)+len(b))
	out = append(out, a...)
	out = append(out, b...)
	return out
}

func (s *service) SetKey(ctx context.Context, userID, id uuid.UUID, apiKey string) error {
	if apiKey == "" {
		return fmt.Errorf("%w: api key required", domain.ErrInvalidInput)
	}
	// Verify the row exists + is owned by userID before writing.
	if _, err := s.repo.Get(ctx, userID, id); err != nil {
		return err
	}
	ct, nonce, err := crypto.Encrypt(s.encKey, []byte(apiKey), associatedData(userID, id))
	if err != nil {
		return fmt.Errorf("encrypt: %w", err)
	}
	return s.repo.UpdateKey(ctx, userID, id, ct, nonce, s.version)
}

func (s *service) ClearKey(ctx context.Context, userID, id uuid.UUID) error {
	if _, err := s.repo.Get(ctx, userID, id); err != nil {
		return err
	}
	return s.repo.UpdateKey(ctx, userID, id, nil, nil, s.version)
}

func (s *service) GetForDispatch(ctx context.Context, userID, id uuid.UUID) (*domain.ProviderSetting, string, error) {
	row, err := s.repo.Get(ctx, userID, id)
	if err != nil {
		return nil, "", err
	}
	if !row.HasKey() {
		return row, "", nil
	}
	pt, err := crypto.Decrypt(s.encKey, row.EncryptedAPIKey, row.KeyNonce, associatedData(userID, id))
	if err != nil {
		return nil, "", fmt.Errorf("decrypt: %w", err)
	}
	return row, string(pt), nil
}

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
	// ReencryptAll walks every row that has an encrypted key and
	// re-encrypts ones whose key_version is below the current
	// version using the matching legacy key, then writes them back at
	// the current version. Returns the count of rows touched. Only
	// the rotation cmd-line entry should call this.
	ReencryptAll(ctx context.Context) (int, error)
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
	// keys maps key_version → raw 32-byte AES-256-GCM key. The
	// version field below names which key the service writes new
	// rows with; legacy versions are kept here only for decrypting
	// existing rows during rotation. After a successful rotation
	// the operator drops the old version + restarts the service
	// with a single-key keys map.
	keys    map[int32][]byte
	version int32
}

// New wires up the service with its repository and a single master
// encryption key (raw 32 bytes; caller is expected to decode from env
// via crypto.KeyFromEnvBase64). Use NewWithRotation when a prior key
// is still in flight.
func New(repo repository.SettingRepository, encKey []byte) (Service, error) {
	return NewWithRotation(repo, 1, encKey, nil)
}

// VersionedKey pairs a key_version number with the raw key bytes. Used
// by NewWithRotation to register prior keys while a re-encryption
// migration is in progress.
type VersionedKey struct {
	Version int32
	Key     []byte
}

// NewWithRotation builds a service that writes new rows with
// `currentKey` at `currentVersion` while still being able to decrypt
// rows written under earlier `legacy` versions. A non-empty legacy
// list is the signal that a rotation is in flight; once ReencryptAll
// has bumped every row to the current version, the operator restarts
// the service with legacy=nil and the old key can be retired.
func NewWithRotation(repo repository.SettingRepository, currentVersion int32, currentKey []byte, legacy []VersionedKey) (Service, error) {
	if len(currentKey) != crypto.KeySize {
		return nil, fmt.Errorf("ai-settings: encryption key must be %d bytes", crypto.KeySize)
	}
	if currentVersion < 1 {
		return nil, fmt.Errorf("ai-settings: current key version must be >= 1, got %d", currentVersion)
	}
	keys := map[int32][]byte{currentVersion: currentKey}
	for _, k := range legacy {
		if len(k.Key) != crypto.KeySize {
			return nil, fmt.Errorf("ai-settings: legacy key v%d must be %d bytes", k.Version, crypto.KeySize)
		}
		if k.Version == currentVersion {
			return nil, fmt.Errorf("ai-settings: legacy key v%d collides with current version", k.Version)
		}
		keys[k.Version] = k.Key
	}
	return &service{repo: repo, keys: keys, version: currentVersion}, nil
}

// keyForVersion returns the raw key for the given version, or an
// error if the service wasn't constructed with that version. The
// error message stays terse — it lands in logs, not user-facing text.
func (s *service) keyForVersion(v int32) ([]byte, error) {
	k, ok := s.keys[v]
	if !ok {
		return nil, fmt.Errorf("ai-settings: no key registered for version %d", v)
	}
	return k, nil
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
	currentKey, err := s.keyForVersion(s.version)
	if err != nil {
		return err
	}
	ct, nonce, err := crypto.Encrypt(currentKey, []byte(apiKey), associatedData(userID, id))
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
	key, err := s.keyForVersion(row.KeyVersion)
	if err != nil {
		return nil, "", err
	}
	pt, err := crypto.Decrypt(key, row.EncryptedAPIKey, row.KeyNonce, associatedData(userID, id))
	if err != nil {
		return nil, "", fmt.Errorf("decrypt: %w", err)
	}
	return row, string(pt), nil
}

// ReencryptAll walks every row that carries an encrypted key and
// rewrites any whose key_version is below the current version using
// the matching legacy key, then re-encrypts under the current key.
// Skips rows already at the current version. Returns the number of
// rows actually re-encrypted (not the total scanned).
//
// Failures on individual rows abort the run — the operator should
// investigate, restore from backup if needed, and re-run; idempotent
// retries are safe because rows already bumped to the current
// version are skipped on the next pass.
func (s *service) ReencryptAll(ctx context.Context) (int, error) {
	rows, err := s.repo.ListAllWithKeys(ctx)
	if err != nil {
		return 0, err
	}
	currentKey, err := s.keyForVersion(s.version)
	if err != nil {
		return 0, err
	}

	updated := 0
	for i := range rows {
		row := &rows[i]
		if row.KeyVersion == s.version {
			continue
		}
		oldKey, err := s.keyForVersion(row.KeyVersion)
		if err != nil {
			return updated, fmt.Errorf("row %s: %w", row.ID, err)
		}
		aad := associatedData(row.UserID, row.ID)
		pt, err := crypto.Decrypt(oldKey, row.EncryptedAPIKey, row.KeyNonce, aad)
		if err != nil {
			return updated, fmt.Errorf("row %s decrypt: %w", row.ID, err)
		}
		ct, nonce, err := crypto.Encrypt(currentKey, pt, aad)
		if err != nil {
			return updated, fmt.Errorf("row %s encrypt: %w", row.ID, err)
		}
		if err := s.repo.UpdateKey(ctx, row.UserID, row.ID, ct, nonce, s.version); err != nil {
			return updated, fmt.Errorf("row %s persist: %w", row.ID, err)
		}
		updated++
	}
	return updated, nil
}

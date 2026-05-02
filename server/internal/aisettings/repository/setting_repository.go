// Package repository owns Postgres access for ai-settings. The interface
// hides the driver from the service layer and keeps tests simple.
package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"inkwell/server/internal/aisettings/domain"
)

// SettingRepository is the storage port for ProviderSetting rows.
type SettingRepository interface {
	List(ctx context.Context, userID uuid.UUID) ([]domain.ProviderSetting, error)
	Get(ctx context.Context, userID, id uuid.UUID) (*domain.ProviderSetting, error)
	Create(ctx context.Context, s *domain.ProviderSetting) error
	UpdateMetadata(ctx context.Context, s *domain.ProviderSetting) error
	UpdateKey(ctx context.Context, userID, id uuid.UUID, encrypted, nonce []byte, keyVersion int32) error
	Delete(ctx context.Context, userID, id uuid.UUID) error
	// ListAllWithKeys returns every row whose encrypted_api_key is set.
	// Used by the key-rotation job — has no user scope by design and
	// should never be called from a request-handling code path.
	ListAllWithKeys(ctx context.Context) ([]domain.ProviderSetting, error)
}

type postgresRepo struct {
	db *sql.DB
}

// NewPostgresRepository constructs a SettingRepository backed by pgx/pq.
func NewPostgresRepository(db *sql.DB) SettingRepository {
	return &postgresRepo{db: db}
}

const baseColumns = `id, user_id, kind, label, enabled, base_url, default_model,
	encrypted_api_key, key_nonce, key_version, created_at, updated_at`

func (r *postgresRepo) List(ctx context.Context, userID uuid.UUID) ([]domain.ProviderSetting, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+baseColumns+` FROM user_ai_providers
		 WHERE user_id = $1 ORDER BY created_at ASC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list: %w", err)
	}
	defer rows.Close()

	out := []domain.ProviderSetting{}
	for rows.Next() {
		s, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

func (r *postgresRepo) Get(ctx context.Context, userID, id uuid.UUID) (*domain.ProviderSetting, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+baseColumns+` FROM user_ai_providers
		 WHERE user_id = $1 AND id = $2`,
		userID, id,
	)
	s, err := scanRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("get: %w", err)
	}
	return s, nil
}

func (r *postgresRepo) Create(ctx context.Context, s *domain.ProviderSetting) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO user_ai_providers
		 (id, user_id, kind, label, enabled, base_url, default_model,
		  encrypted_api_key, key_nonce, key_version, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		s.ID, s.UserID, string(s.Kind), s.Label, s.Enabled,
		nullableString(s.BaseURL), nullableString(s.DefaultModel),
		s.EncryptedAPIKey, s.KeyNonce, s.KeyVersion,
		s.CreatedAt, s.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create: %w", err)
	}
	return nil
}

func (r *postgresRepo) UpdateMetadata(ctx context.Context, s *domain.ProviderSetting) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE user_ai_providers SET
		   kind = $3, label = $4, enabled = $5,
		   base_url = $6, default_model = $7, updated_at = $8
		 WHERE user_id = $1 AND id = $2`,
		s.UserID, s.ID, string(s.Kind), s.Label, s.Enabled,
		nullableString(s.BaseURL), nullableString(s.DefaultModel), s.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("update metadata: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *postgresRepo) UpdateKey(ctx context.Context, userID, id uuid.UUID, encrypted, nonce []byte, keyVersion int32) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE user_ai_providers SET
		   encrypted_api_key = $3, key_nonce = $4, key_version = $5, updated_at = NOW()
		 WHERE user_id = $1 AND id = $2`,
		userID, id, encrypted, nonce, keyVersion,
	)
	if err != nil {
		return fmt.Errorf("update key: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *postgresRepo) ListAllWithKeys(ctx context.Context) ([]domain.ProviderSetting, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+baseColumns+` FROM user_ai_providers
		 WHERE encrypted_api_key IS NOT NULL ORDER BY key_version, created_at`,
	)
	if err != nil {
		return nil, fmt.Errorf("list all with keys: %w", err)
	}
	defer rows.Close()

	out := []domain.ProviderSetting{}
	for rows.Next() {
		s, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

func (r *postgresRepo) Delete(ctx context.Context, userID, id uuid.UUID) error {
	res, err := r.db.ExecContext(ctx,
		`DELETE FROM user_ai_providers WHERE user_id = $1 AND id = $2`,
		userID, id,
	)
	if err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// rowScanner abstracts *sql.Row and *sql.Rows for scanRow.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanRow(r rowScanner) (*domain.ProviderSetting, error) {
	var (
		s        domain.ProviderSetting
		kind     string
		baseURL  sql.NullString
		defModel sql.NullString
		encKey   []byte
		nonce    []byte
	)
	if err := r.Scan(
		&s.ID, &s.UserID, &kind, &s.Label, &s.Enabled,
		&baseURL, &defModel, &encKey, &nonce, &s.KeyVersion,
		&s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	s.Kind = domain.Kind(kind)
	if baseURL.Valid {
		s.BaseURL = baseURL.String
	}
	if defModel.Valid {
		s.DefaultModel = defModel.String
	}
	s.EncryptedAPIKey = encKey
	s.KeyNonce = nonce
	return &s, nil
}

func nullableString(v string) any {
	if v == "" {
		return nil
	}
	return v
}

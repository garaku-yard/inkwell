package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"inkwell/server/internal/scripts/domain"
)

type characterRepository struct{ db *sql.DB }

func NewCharacterRepository(db *sql.DB) CharacterRepository { return &characterRepository{db: db} }

func (r *characterRepository) CreateCharacter(ctx context.Context, character *domain.Character) error {
	attributes, err := json.Marshal(character.Attributes)
	if err != nil {
		return fmt.Errorf("marshal character attributes: %w", err)
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO characters (character_id, project_id, name, description, role, attributes, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		character.ID, character.ProjectID, character.Name, character.Description,
		character.Role, attributes, character.CreatedAt, character.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create character: %w", err)
	}
	return nil
}

func scanCharacter(scanner interface{ Scan(...any) error }) (*domain.Character, error) {
	character := &domain.Character{}
	var attributes []byte
	err := scanner.Scan(
		&character.ID, &character.ProjectID, &character.Name, &character.Description,
		&character.Role, &attributes, &character.CreatedAt, &character.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	character.Attributes = map[string]string{}
	if len(attributes) > 0 {
		if err := json.Unmarshal(attributes, &character.Attributes); err != nil {
			return nil, fmt.Errorf("decode character attributes: %w", err)
		}
	}
	return character, nil
}

const characterColumns = `character_id, project_id, name, COALESCE(description, ''), COALESCE(role, ''), attributes, created_at, updated_at`

func (r *characterRepository) GetCharacter(ctx context.Context, characterID uuid.UUID) (*domain.Character, error) {
	character, err := scanCharacter(r.db.QueryRowContext(ctx,
		`SELECT `+characterColumns+` FROM characters WHERE character_id = $1 AND deleted_at IS NULL`,
		characterID,
	))
	if err == sql.ErrNoRows {
		return nil, domain.ErrCharacterNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get character: %w", err)
	}
	return character, nil
}

func (r *characterRepository) GetProjectCharacters(ctx context.Context, projectID uuid.UUID) ([]*domain.Character, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+characterColumns+` FROM characters WHERE project_id = $1 AND deleted_at IS NULL ORDER BY LOWER(name), character_id`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("list project characters: %w", err)
	}
	defer rows.Close()

	characters := make([]*domain.Character, 0)
	for rows.Next() {
		character, err := scanCharacter(rows)
		if err != nil {
			return nil, fmt.Errorf("scan character: %w", err)
		}
		characters = append(characters, character)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list project characters: %w", err)
	}
	return characters, nil
}

func (r *characterRepository) UpdateCharacter(ctx context.Context, character *domain.Character) error {
	attributes, err := json.Marshal(character.Attributes)
	if err != nil {
		return fmt.Errorf("marshal character attributes: %w", err)
	}
	result, err := r.db.ExecContext(ctx, `
		UPDATE characters
		SET name = $2, description = $3, role = $4, attributes = $5, updated_at = $6
		WHERE character_id = $1 AND deleted_at IS NULL`,
		character.ID, character.Name, character.Description, character.Role, attributes, character.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("update character: %w", err)
	}
	if changed, err := result.RowsAffected(); err == nil && changed == 0 {
		return domain.ErrCharacterNotFound
	}
	return nil
}

func (r *characterRepository) DeleteCharacter(ctx context.Context, characterID uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE characters SET deleted_at = NOW(), updated_at = NOW()
		WHERE character_id = $1 AND deleted_at IS NULL`, characterID)
	if err != nil {
		return fmt.Errorf("delete character: %w", err)
	}
	if changed, err := result.RowsAffected(); err == nil && changed == 0 {
		return domain.ErrCharacterNotFound
	}
	return nil
}

package repository

import (
	"database/sql"

	"github.com/l1roii/screenwriter/server/internal/entity"
)

type ScreenplayRepository interface {
	UpdateSceneSetting(sceneID string, setting string) error
	UpdateScriptElementContent(elementID string, content string) error
	UpdateScriptElementsOrder(sceneID string, elements []*entity.ScriptElement) error
	CreateElement(element *entity.ScriptElement) (*entity.ScriptElement, error)
	GetProjectIDForScene(sceneID string) (string, error)
	GetProjectIDForElement(elementID string) (string, error)
}

type postgresScreenplayRepository struct {
	db *sql.DB
}

func NewScreenplayRepository(db *sql.DB) ScreenplayRepository {
	return &postgresScreenplayRepository{db: db}
}

func (r *postgresScreenplayRepository) UpdateSceneSetting(sceneID string, setting string) error {
	query := `UPDATE scenes SET setting = $1 WHERE scene_id = $2`
	_, err := r.db.Exec(query, setting, sceneID)
	return err
}

func (r *postgresScreenplayRepository) UpdateScriptElementContent(elementID string, content string) error {
	query := `UPDATE script_elements SET content = $1 WHERE element_id = $2`
	_, err := r.db.Exec(query, content, elementID)
	return err
}

func (r *postgresScreenplayRepository) UpdateScriptElementsOrder(sceneID string, elements []*entity.ScriptElement) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare(`UPDATE script_elements SET element_order = $1 WHERE element_id = $2`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, el := range elements {
		_, err := stmt.Exec(el.ElementOrder, el.ID)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func (r *postgresScreenplayRepository) CreateElement(element *entity.ScriptElement) (*entity.ScriptElement, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	shiftQuery := `
		UPDATE script_elements
		SET element_order = element_order + 1
		WHERE scene_id = $1 AND element_order >= $2`
	_, err = tx.Exec(shiftQuery, element.SceneID, element.ElementOrder)
	if err != nil {
		return nil, err
	}

	insertQuery := `
		INSERT INTO script_elements (scene_id, element_order, element_type, content)
		VALUES ($1, $2, $3, $4)
		RETURNING element_id`
	err = tx.QueryRow(
		insertQuery,
		element.SceneID,
		element.ElementOrder,
		element.ElementType,
		element.Content,
	).Scan(&element.ID)
	if err != nil {
		return nil, err
	}

	return element, tx.Commit()
}

func (r *postgresScreenplayRepository) GetProjectIDForScene(sceneID string) (string, error) {
	var projectID string
	query := `
		SELECT p.project_id FROM projects p
		JOIN acts a ON p.project_id = a.project_id
		JOIN scenes s ON a.act_id = s.act_id
		WHERE s.scene_id = $1`
	err := r.db.QueryRow(query, sceneID).Scan(&projectID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return projectID, err
}

func (r *postgresScreenplayRepository) GetProjectIDForElement(elementID string) (string, error) {
	var projectID string
	query := `
		SELECT p.project_id FROM projects p
		JOIN acts a ON p.project_id = a.project_id
		JOIN scenes s ON a.act_id = s.act_id
		JOIN script_elements se ON s.scene_id = se.scene_id
		WHERE se.element_id = $1`
	err := r.db.QueryRow(query, elementID).Scan(&projectID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return projectID, err
}

package repository

import (
	"database/sql"
	"log"

	"github.com/l1roii/screenwriter/server/internal/entity"
)

type ScreenplayRepository interface {
	GetProjectIDForScene(sceneID string) (string, error)
	GetProjectIDForElement(elementID string) (string, error)
	CreateElement(element *entity.ScriptElement) (*entity.ScriptElement, error)
	UpdateSceneSetting(sceneID string, setting string) error
	UpdateScriptElementContent(elementID string, content string) error
	UpdateScriptElementsOrder(sceneID string, elements []*entity.ScriptElement) error
	DeleteElement(elementID string) error
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

	var nextOrder int
	orderQuery := `SELECT COALESCE(MAX(element_order), 0) + 1 FROM script_elements WHERE scene_id = $1`
	if err := tx.QueryRow(orderQuery, element.SceneID).Scan(&nextOrder); err != nil {
		return nil, err
	}
	element.ElementOrder = nextOrder

	insertQuery := `
		INSERT INTO script_elements (scene_id, element_order, element_type, content)
		VALUES ($1, $2, $3, $4)
		RETURNING element_id, element_order`

	err = tx.QueryRow(
		insertQuery,
		element.SceneID,
		element.ElementOrder,
		element.ElementType,
		element.Content,
	).Scan(&element.ID, &element.ElementOrder)
	if err != nil {
		return nil, err
	}

	return element, tx.Commit() // Commit the transaction
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

func (r *postgresScreenplayRepository) DeleteElement(elementID string) error {
	tx, err := r.db.Begin()
	if err != nil {
		log.Printf("DB ERROR: Failed to begin transaction for deleting element %s: %v", elementID, err)
		return err
	}
	defer tx.Rollback()

	var sceneID string
	var order int
	err = tx.QueryRow(
		"SELECT scene_id, element_order FROM script_elements WHERE element_id = $1",
		elementID,
	).Scan(&sceneID, &order)
	if err != nil {
		log.Printf("DB ERROR: Could not get scene_id and order for element %s: %v", elementID, err)
		return err
	}

	_, err = tx.Exec("DELETE FROM script_elements WHERE element_id = $1", elementID)
	if err != nil {
		log.Printf("DB ERROR: Failed to execute DELETE statement for element %s: %v", elementID, err)
		return err
	}

	_, err = tx.Exec(
		"UPDATE script_elements SET element_order = -element_order WHERE scene_id = $1 AND element_order > $2",
		sceneID,
		order,
	)
	if err != nil {
		log.Printf("DB ERROR: Failed on Step 1 of re-order (setting to negative) for scene %s: %v", sceneID, err)
		return err
	}

	_, err = tx.Exec(
		"UPDATE script_elements SET element_order = -element_order - 1 WHERE scene_id = $1 AND element_order < 0",
		sceneID,
	)
	if err != nil {
		log.Printf("DB ERROR: Failed on Step 2 of re-order (setting to final) for scene %s: %v", sceneID, err)
		return err
	}

	return tx.Commit()
}

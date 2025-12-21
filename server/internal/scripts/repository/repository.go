package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"scriptlith/server/internal/scripts/domain"
)

// ProjectRepository defines the interface for project data access
type ProjectRepository interface {
	// Project operations
	CreateProject(ctx context.Context, project *domain.Project) error
	GetProjectByID(ctx context.Context, projectID uuid.UUID) (*domain.Project, error)
	GetProjectsByOwner(ctx context.Context, ownerID uuid.UUID, offset, limit int) ([]*domain.Project, int64, error)
	UpdateProject(ctx context.Context, project *domain.Project) error
	SoftDeleteProject(ctx context.Context, projectID uuid.UUID) error

	// Authorization helpers
	IsProjectOwner(ctx context.Context, projectID, userID uuid.UUID) (bool, error)
	ProjectExists(ctx context.Context, projectID uuid.UUID) (bool, error)
}

// ScriptElementRepository defines the interface for script element data access
type ScriptElementRepository interface {
	CreateScriptElement(ctx context.Context, element *domain.ScriptElement) error
	GetScriptElement(ctx context.Context, elementID uuid.UUID) (*domain.ScriptElement, error)
	GetProjectScriptElements(ctx context.Context, projectID uuid.UUID, startLine, endLine int32) ([]*domain.ScriptElement, error)
	GetSceneElements(ctx context.Context, sceneID uuid.UUID) ([]*domain.ScriptElement, error)
	UpdateScriptElement(ctx context.Context, element *domain.ScriptElement) error
	DeleteScriptElement(ctx context.Context, elementID uuid.UUID) error
	BulkUpdateScriptElements(ctx context.Context, elements []*domain.ScriptElement) error
}

// SceneRepository defines the interface for scene data access
type SceneRepository interface {
	CreateScene(ctx context.Context, scene *domain.Scene) error
	GetScene(ctx context.Context, sceneID uuid.UUID) (*domain.Scene, error)
	GetProjectScenes(ctx context.Context, projectID uuid.UUID) ([]*domain.Scene, error)
	UpdateScene(ctx context.Context, scene *domain.Scene) error
	DeleteScene(ctx context.Context, sceneID uuid.UUID) error
}

// CharacterRepository defines the interface for character data access
type CharacterRepository interface {
	CreateCharacter(ctx context.Context, character *domain.Character) error
	GetCharacter(ctx context.Context, characterID uuid.UUID) (*domain.Character, error)
	GetProjectCharacters(ctx context.Context, projectID uuid.UUID) ([]*domain.Character, error)
	UpdateCharacter(ctx context.Context, character *domain.Character) error
	DeleteCharacter(ctx context.Context, characterID uuid.UUID) error
}

// LocationRepository defines the interface for location data access
type LocationRepository interface {
	CreateLocation(ctx context.Context, location *domain.Location) error
	GetLocation(ctx context.Context, locationID uuid.UUID) (*domain.Location, error)
	GetProjectLocations(ctx context.Context, projectID uuid.UUID) ([]*domain.Location, error)
	UpdateLocation(ctx context.Context, location *domain.Location) error
	DeleteLocation(ctx context.Context, locationID uuid.UUID) error
}

// OutlineRepository defines the interface for outline unit data access
type OutlineRepository interface {
	CreateOutlineUnit(ctx context.Context, unit *domain.OutlineUnit) error
	GetOutlineUnit(ctx context.Context, unitID uuid.UUID) (*domain.OutlineUnit, error)
	GetProjectOutline(ctx context.Context, projectID uuid.UUID, typeFilter string) ([]*domain.OutlineUnit, error)
	UpdateOutlineUnit(ctx context.Context, unit *domain.OutlineUnit) error
	DeleteOutlineUnit(ctx context.Context, unitID uuid.UUID) error
}

// BeatRepository defines the interface for beat data access
type BeatRepository interface {
	CreateBeat(ctx context.Context, beat *domain.Beat) error
	GetBeat(ctx context.Context, beatID uuid.UUID) (*domain.Beat, error)
	GetProjectBeats(ctx context.Context, projectID uuid.UUID) ([]*domain.Beat, error)
	UpdateBeat(ctx context.Context, beat *domain.Beat) error
	DeleteBeat(ctx context.Context, beatID uuid.UUID) error
}

// ConnectionRepository defines the interface for beat connection data access
type ConnectionRepository interface {
	CreateConnection(ctx context.Context, conn *domain.Connection) error
	GetConnection(ctx context.Context, connID uuid.UUID) (*domain.Connection, error)
	GetProjectConnections(ctx context.Context, projectID uuid.UUID) ([]*domain.Connection, error)
	DeleteConnection(ctx context.Context, connID uuid.UUID) error
}

// LaneRepository defines the interface for lane data access
type LaneRepository interface {
	CreateLane(ctx context.Context, lane *domain.Lane) error
	GetLane(ctx context.Context, laneID uuid.UUID) (*domain.Lane, error)
	GetProjectLanes(ctx context.Context, projectID uuid.UUID) ([]*domain.Lane, error)
	UpdateLane(ctx context.Context, lane *domain.Lane) error
	UpdateLaneOrder(ctx context.Context, projectID uuid.UUID, laneIDs []uuid.UUID) error
	DeleteLane(ctx context.Context, laneID uuid.UUID) error
}

// OutlineItemRepository defines the interface for outline item data access
type OutlineItemRepository interface {
	CreateOutlineItem(ctx context.Context, item *domain.OutlineItem) error
	GetOutlineItem(ctx context.Context, itemID uuid.UUID) (*domain.OutlineItem, error)
	GetProjectOutlineItems(ctx context.Context, projectID uuid.UUID) ([]*domain.OutlineItem, error)
	UpdateOutlineItem(ctx context.Context, item *domain.OutlineItem) error
	DeleteOutlineItem(ctx context.Context, itemID uuid.UUID) error
}

// Repository aggregates all repository interfaces
type Repository struct {
	Project       ProjectRepository
	ScriptElement ScriptElementRepository
	Scene         SceneRepository
	Character     CharacterRepository
	Location      LocationRepository
	Outline       OutlineRepository
	Beat          BeatRepository
	Connection    ConnectionRepository
	Lane          LaneRepository
	OutlineItem   OutlineItemRepository
}

// NewRepository creates a new repository instance
func NewRepository(db *sql.DB) *Repository {
	return &Repository{
		Project:       NewProjectRepository(db),
		ScriptElement: NewScriptElementRepository(db),
		Scene:         NewSceneRepository(db),
		Character:     NewCharacterRepository(db),
		Location:      NewLocationRepository(db),
		Outline:       NewOutlineRepository(db),
		Beat:          NewBeatRepository(db),
		Connection:    NewConnectionRepository(db),
		Lane:          NewLaneRepository(db),
		OutlineItem:   NewOutlineItemRepository(db),
	}
}

// projectRepository implements ProjectRepository
type projectRepository struct {
	db *sql.DB
}

// NewProjectRepository creates a new ProjectRepository instance
func NewProjectRepository(db *sql.DB) ProjectRepository {
	return &projectRepository{db: db}
}

// CreateProject creates a new project in the database
func (r *projectRepository) CreateProject(ctx context.Context, project *domain.Project) error {
	query := `
		INSERT INTO projects (project_id, title, description, owner_id, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`

	_, err := r.db.ExecContext(ctx, query,
		project.ID,
		project.Title,
		project.Description,
		project.OwnerID,
		project.Status,
		project.CreatedAt,
		project.UpdatedAt,
	)

	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			return domain.ErrProjectExists
		}
		return fmt.Errorf("failed to create project: %w", err)
	}

	return nil
}

// GetProjectByID retrieves a project by ID
func (r *projectRepository) GetProjectByID(ctx context.Context, projectID uuid.UUID) (*domain.Project, error) {
	query := `
		SELECT project_id, title, description, owner_id, status, is_starred, created_at, updated_at, deleted_at
		FROM projects
		WHERE project_id = $1 AND deleted_at IS NULL
	`

	var project domain.Project
	err := r.db.QueryRowContext(ctx, query, projectID).Scan(
		&project.ID,
		&project.Title,
		&project.Description,
		&project.OwnerID,
		&project.Status,
		&project.IsStarred,
		&project.CreatedAt,
		&project.UpdatedAt,
		&project.DeletedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrProjectNotFound
		}
		return nil, fmt.Errorf("failed to get project: %w", err)
	}

	return &project, nil
}

// GetProjectsByOwner retrieves projects by owner with pagination
func (r *projectRepository) GetProjectsByOwner(ctx context.Context, ownerID uuid.UUID, offset, limit int) ([]*domain.Project, int64, error) {
	// Get total count
	countQuery := `SELECT COUNT(*) FROM projects WHERE owner_id = $1 AND deleted_at IS NULL`
	var total int64
	err := r.db.QueryRowContext(ctx, countQuery, ownerID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count projects: %w", err)
	}

	// Get projects
	query := `
		SELECT project_id, title, description, owner_id, status, is_starred, created_at, updated_at, deleted_at
		FROM projects
		WHERE owner_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC
		OFFSET $2 LIMIT $3
	`

	rows, err := r.db.QueryContext(ctx, query, ownerID, offset, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get projects: %w", err)
	}
	defer rows.Close()

	var projects []*domain.Project
	for rows.Next() {
		var project domain.Project
		err := rows.Scan(
			&project.ID,
			&project.Title,
			&project.Description,
			&project.OwnerID,
			&project.Status,
			&project.IsStarred,
			&project.CreatedAt,
			&project.UpdatedAt,
			&project.DeletedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan project: %w", err)
		}
		projects = append(projects, &project)
	}

	return projects, total, nil
}

// UpdateProject updates an existing project
func (r *projectRepository) UpdateProject(ctx context.Context, project *domain.Project) error {
	query := `
		UPDATE projects 
		SET title = $2, description = $3, status = $4, is_starred = $5, updated_at = $6
		WHERE project_id = $1 AND deleted_at IS NULL
	`

	result, err := r.db.ExecContext(ctx, query,
		project.ID,
		project.Title,
		project.Description,
		project.Status,
		project.IsStarred,
		project.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to update project: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrProjectNotFound
	}

	return nil
}

// SoftDeleteProject marks a project as deleted
func (r *projectRepository) SoftDeleteProject(ctx context.Context, projectID uuid.UUID) error {
	query := `
		UPDATE projects 
		SET deleted_at = NOW(), updated_at = NOW()
		WHERE project_id = $1 AND deleted_at IS NULL
	`

	result, err := r.db.ExecContext(ctx, query, projectID)
	if err != nil {
		return fmt.Errorf("failed to delete project: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrProjectNotFound
	}

	return nil
}

// IsProjectOwner checks if user is the owner of the project
func (r *projectRepository) IsProjectOwner(ctx context.Context, projectID, userID uuid.UUID) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM projects WHERE project_id = $1 AND owner_id = $2 AND deleted_at IS NULL)`

	var exists bool
	err := r.db.QueryRowContext(ctx, query, projectID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check project ownership: %w", err)
	}

	return exists, nil
}

// ProjectExists checks if project exists
func (r *projectRepository) ProjectExists(ctx context.Context, projectID uuid.UUID) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM projects WHERE project_id = $1 AND deleted_at IS NULL)`

	var exists bool
	err := r.db.QueryRowContext(ctx, query, projectID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check project existence: %w", err)
	}

	return exists, nil
}

// Placeholder implementations for other repositories
// These will be implemented in separate files for better organization

type scriptElementRepository struct{ db *sql.DB }

func NewScriptElementRepository(db *sql.DB) ScriptElementRepository {
	return &scriptElementRepository{db}
}
func (r *scriptElementRepository) CreateScriptElement(ctx context.Context, element *domain.ScriptElement) error {
	query := `
		INSERT INTO script_elements (element_id, project_id, scene_id, element_type, content, character_id, line_number, formatting, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`

	var sceneID interface{}
	if element.SceneID != nil {
		sceneID = *element.SceneID
	}

	var characterID interface{}
	if element.CharacterID != nil {
		characterID = *element.CharacterID
	}

	// Convert map to JSON string for storage
	formattingJSON := "{}"
	if len(element.Formatting) > 0 {
		if jsonBytes, err := json.Marshal(element.Formatting); err == nil {
			formattingJSON = string(jsonBytes)
		}
	}

	_, err := r.db.ExecContext(ctx, query,
		element.ID,
		element.ProjectID,
		sceneID,
		element.Type,
		element.Content,
		characterID,
		element.LineNumber,
		formattingJSON,
		element.CreatedAt,
		element.UpdatedAt,
	)

	return err
}
func (r *scriptElementRepository) GetScriptElement(ctx context.Context, elementID uuid.UUID) (*domain.ScriptElement, error) {
	query := `
		SELECT element_id, project_id, scene_id, element_type, content, character_id, line_number, formatting, created_at, updated_at
		FROM script_elements 
		WHERE element_id = $1
	`

	element := &domain.ScriptElement{}
	var sceneID *uuid.UUID
	var characterID *uuid.UUID
	var formattingJSON string

	err := r.db.QueryRowContext(ctx, query, elementID).Scan(
		&element.ID,
		&element.ProjectID,
		&sceneID,
		&element.Type,
		&element.Content,
		&characterID,
		&element.LineNumber,
		&formattingJSON,
		&element.CreatedAt,
		&element.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrScriptElementNotFound
		}
		return nil, fmt.Errorf("failed to get script element: %w", err)
	}

	element.SceneID = sceneID
	element.CharacterID = characterID

	// Parse formatting JSON
	element.Formatting = make(map[string]string)
	if formattingJSON != "" && formattingJSON != "{}" {
		if err := json.Unmarshal([]byte(formattingJSON), &element.Formatting); err != nil {
			// If JSON parsing fails, just set empty map
			element.Formatting = make(map[string]string)
		}
	}

	return element, nil
}
func (r *scriptElementRepository) GetProjectScriptElements(ctx context.Context, projectID uuid.UUID, startLine, endLine int32) ([]*domain.ScriptElement, error) {
	return nil, nil
}
func (r *scriptElementRepository) GetSceneElements(ctx context.Context, sceneID uuid.UUID) ([]*domain.ScriptElement, error) {
	query := `
		SELECT element_id, project_id, scene_id, element_type, content, character_id, line_number, formatting, created_at, updated_at
		FROM script_elements 
		WHERE scene_id = $1
		ORDER BY line_number
	`

	rows, err := r.db.QueryContext(ctx, query, sceneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var elements []*domain.ScriptElement
	for rows.Next() {
		element := &domain.ScriptElement{}
		var sceneIDPtr *uuid.UUID
		var characterIDPtr *uuid.UUID
		var formattingJSON string

		err := rows.Scan(
			&element.ID,
			&element.ProjectID,
			&sceneIDPtr,
			&element.Type,
			&element.Content,
			&characterIDPtr,
			&element.LineNumber,
			&formattingJSON,
			&element.CreatedAt,
			&element.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		element.SceneID = sceneIDPtr
		element.CharacterID = characterIDPtr

		// Parse formatting JSON
		if formattingJSON != "" && formattingJSON != "{}" {
			var formatting map[string]string
			if err := json.Unmarshal([]byte(formattingJSON), &formatting); err == nil {
				element.Formatting = formatting
			}
		}

		elements = append(elements, element)
	}

	return elements, rows.Err()
}
func (r *scriptElementRepository) UpdateScriptElement(ctx context.Context, element *domain.ScriptElement) error {
	query := `
		UPDATE script_elements 
		SET content = $2, updated_at = $3
		WHERE element_id = $1
	`

	_, err := r.db.ExecContext(ctx, query,
		element.ID,
		element.Content,
		element.UpdatedAt,
	)

	return err
}
func (r *scriptElementRepository) DeleteScriptElement(ctx context.Context, elementID uuid.UUID) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Get scene_id and line_number before deletion
	var sceneID uuid.UUID
	var lineNumber int32
	err = tx.QueryRowContext(ctx,
		"SELECT scene_id, line_number FROM script_elements WHERE element_id = $1",
		elementID,
	).Scan(&sceneID, &lineNumber)
	if err != nil {
		return fmt.Errorf("failed to get element info: %w", err)
	}

	// Delete the element
	_, err = tx.ExecContext(ctx, "DELETE FROM script_elements WHERE element_id = $1", elementID)
	if err != nil {
		return fmt.Errorf("failed to delete element: %w", err)
	}

	// Reorder remaining elements in the scene
	// Step 1: Set all elements with higher line_number to negative values
	_, err = tx.ExecContext(ctx,
		"UPDATE script_elements SET line_number = -line_number WHERE scene_id = $1 AND line_number > $2",
		sceneID, lineNumber,
	)
	if err != nil {
		return fmt.Errorf("failed to reorder elements (step 1): %w", err)
	}

	// Step 2: Convert negative values to correct positive values (shift down by 1)
	_, err = tx.ExecContext(ctx,
		"UPDATE script_elements SET line_number = -line_number - 1 WHERE scene_id = $1 AND line_number < 0",
		sceneID,
	)
	if err != nil {
		return fmt.Errorf("failed to reorder elements (step 2): %w", err)
	}

	return tx.Commit()
}
func (r *scriptElementRepository) BulkUpdateScriptElements(ctx context.Context, elements []*domain.ScriptElement) error {
	return nil
}

type sceneRepository struct{ db *sql.DB }

func NewSceneRepository(db *sql.DB) SceneRepository { return &sceneRepository{db} }
func (r *sceneRepository) CreateScene(ctx context.Context, scene *domain.Scene) error {
	query := `
		INSERT INTO scenes (scene_id, project_id, outline_unit_id, scene_heading, content, order_index, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`

	var outlineUnitID interface{}
	if scene.OutlineUnitID != nil {
		outlineUnitID = *scene.OutlineUnitID
	}

	_, err := r.db.ExecContext(ctx, query,
		scene.ID,
		scene.ProjectID,
		outlineUnitID,
		scene.SceneHeading,
		scene.Content,
		scene.OrderIndex,
		scene.CreatedAt,
		scene.UpdatedAt,
	)

	return err
}
func (r *sceneRepository) GetScene(ctx context.Context, sceneID uuid.UUID) (*domain.Scene, error) {
	query := `
		SELECT scene_id, project_id, outline_unit_id, scene_heading, content, order_index, created_at, updated_at
		FROM scenes 
		WHERE scene_id = $1
	`

	scene := &domain.Scene{}
	var outlineUnitID *uuid.UUID

	err := r.db.QueryRowContext(ctx, query, sceneID).Scan(
		&scene.ID,
		&scene.ProjectID,
		&outlineUnitID,
		&scene.SceneHeading,
		&scene.Content,
		&scene.OrderIndex,
		&scene.CreatedAt,
		&scene.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("scene not found")
		}
		return nil, err
	}

	scene.OutlineUnitID = outlineUnitID
	return scene, nil
}
func (r *sceneRepository) GetProjectScenes(ctx context.Context, projectID uuid.UUID) ([]*domain.Scene, error) {
	query := `
		SELECT scene_id, project_id, outline_unit_id, scene_heading, content, order_index, created_at, updated_at
		FROM scenes 
		WHERE project_id = $1
		ORDER BY order_index ASC
	`

	rows, err := r.db.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scenes []*domain.Scene
	for rows.Next() {
		scene := &domain.Scene{}
		var outlineUnitID *uuid.UUID

		err := rows.Scan(
			&scene.ID,
			&scene.ProjectID,
			&outlineUnitID,
			&scene.SceneHeading,
			&scene.Content,
			&scene.OrderIndex,
			&scene.CreatedAt,
			&scene.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		scene.OutlineUnitID = outlineUnitID
		scenes = append(scenes, scene)
	}

	return scenes, rows.Err()
}
func (r *sceneRepository) UpdateScene(ctx context.Context, scene *domain.Scene) error {
	query := `
		UPDATE scenes 
		SET scene_heading = $2, content = $3, order_index = $4, updated_at = $5
		WHERE scene_id = $1
	`

	_, err := r.db.ExecContext(ctx, query,
		scene.ID,
		scene.SceneHeading,
		scene.Content,
		scene.OrderIndex,
		scene.UpdatedAt,
	)

	return err
}
func (r *sceneRepository) DeleteScene(ctx context.Context, sceneID uuid.UUID) error {
	// Delete all elements in the scene first, then delete the scene
	_, err := r.db.ExecContext(ctx, `DELETE FROM script_elements WHERE scene_id = $1`, sceneID)
	if err != nil {
		return err
	}

	_, err = r.db.ExecContext(ctx, `DELETE FROM scenes WHERE scene_id = $1`, sceneID)
	return err
}

type characterRepository struct{ db *sql.DB }

func NewCharacterRepository(db *sql.DB) CharacterRepository { return &characterRepository{db} }
func (r *characterRepository) CreateCharacter(ctx context.Context, character *domain.Character) error {
	return nil
}
func (r *characterRepository) GetCharacter(ctx context.Context, characterID uuid.UUID) (*domain.Character, error) {
	return nil, nil
}
func (r *characterRepository) GetProjectCharacters(ctx context.Context, projectID uuid.UUID) ([]*domain.Character, error) {
	return nil, nil
}
func (r *characterRepository) UpdateCharacter(ctx context.Context, character *domain.Character) error {
	return nil
}
func (r *characterRepository) DeleteCharacter(ctx context.Context, characterID uuid.UUID) error {
	return nil
}

type locationRepository struct{ db *sql.DB }

func NewLocationRepository(db *sql.DB) LocationRepository { return &locationRepository{db} }
func (r *locationRepository) CreateLocation(ctx context.Context, location *domain.Location) error {
	return nil
}
func (r *locationRepository) GetLocation(ctx context.Context, locationID uuid.UUID) (*domain.Location, error) {
	return nil, nil
}
func (r *locationRepository) GetProjectLocations(ctx context.Context, projectID uuid.UUID) ([]*domain.Location, error) {
	return nil, nil
}
func (r *locationRepository) UpdateLocation(ctx context.Context, location *domain.Location) error {
	return nil
}
func (r *locationRepository) DeleteLocation(ctx context.Context, locationID uuid.UUID) error {
	return nil
}

type outlineRepository struct{ db *sql.DB }

func NewOutlineRepository(db *sql.DB) OutlineRepository { return &outlineRepository{db} }
func (r *outlineRepository) CreateOutlineUnit(ctx context.Context, unit *domain.OutlineUnit) error {
	return nil
}
func (r *outlineRepository) GetOutlineUnit(ctx context.Context, unitID uuid.UUID) (*domain.OutlineUnit, error) {
	return nil, nil
}
func (r *outlineRepository) GetProjectOutline(ctx context.Context, projectID uuid.UUID, typeFilter string) ([]*domain.OutlineUnit, error) {
	return nil, nil
}
func (r *outlineRepository) UpdateOutlineUnit(ctx context.Context, unit *domain.OutlineUnit) error {
	return nil
}
func (r *outlineRepository) DeleteOutlineUnit(ctx context.Context, unitID uuid.UUID) error {
	return nil
}

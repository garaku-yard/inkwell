package repository

import (
	"database/sql"
	"strings"
	"time"

	"github.com/l1roii/screenwriter/server/internal/entity"
)

type postgresProjectRepository struct {
	db *sql.DB
}

func NewProjectRepository(db *sql.DB) ProjectRepository {
	return &postgresProjectRepository{db: db}
}

func (r *postgresProjectRepository) ListByUserID(userID string) ([]*entity.Project, error) {
	query := `
		SELECT 
				p.project_id, 
				p.user_id, 
				p.project_name, 
				p.description, 
				p.is_starred, 
				p.created_at, 
				p.updated_at,
				(SELECT COUNT(*) FROM project_collaborators pc WHERE pc.project_id = p.project_id) as collaborator_count
		FROM 
				projects p
		WHERE 
				p.user_id = $1 
				OR p.project_id IN (
						SELECT pc.project_id 
						FROM project_collaborators pc 
						WHERE pc.user_id = $1
				)
		ORDER BY 
				p.updated_at DESC`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []*entity.Project
	for rows.Next() {
		var p entity.Project
		if err := rows.Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Description, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt, &p.CollaboratorCount); err != nil {
			return nil, err
		}
		projects = append(projects, &p)
	}
	return projects, rows.Err()
}

func (r *postgresProjectRepository) GetByID(projectID string) (*entity.Project, error) {
	query := `SELECT project_id, user_id, project_name, description, is_starred, created_at, updated_at FROM projects WHERE project_id = $1`
	var p entity.Project
	err := r.db.QueryRow(query, projectID).Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Description, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &p, err
}

func (r *postgresProjectRepository) GetFullProjectByID(projectID string) (*entity.FullProject, error) {
	projectQuery := `SELECT project_id, user_id, project_name, description, is_starred, created_at, updated_at FROM projects WHERE project_id = $1`
	var fullProject entity.FullProject
	err := r.db.QueryRow(projectQuery, projectID).Scan(&fullProject.ID, &fullProject.UserID, &fullProject.ProjectName, &fullProject.Description, &fullProject.IsStarred, &fullProject.CreatedAt, &fullProject.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	actsQuery := `SELECT act_id, project_id, act_number, title FROM acts WHERE project_id = $1 ORDER BY act_number ASC`
	actsRows, err := r.db.Query(actsQuery, projectID)
	if err != nil {
		return nil, err
	}
	defer actsRows.Close()

	actMap := make(map[string]*entity.Act)
	var actIDs []string
	for actsRows.Next() {
		var act entity.Act
		if err := actsRows.Scan(&act.ID, &act.ProjectID, &act.ActNumber, &act.Title); err != nil {
			return nil, err
		}
		act.Scenes = []*entity.Scene{}
		fullProject.Acts = append(fullProject.Acts, &act)
		actMap[act.ID] = &act
		actIDs = append(actIDs, act.ID)
	}
	if len(actIDs) == 0 {
		return &fullProject, nil
	}

	scenesQuery := `SELECT scene_id, act_id, scene_number, setting FROM scenes WHERE act_id = ANY($1) ORDER BY scene_number ASC`
	sceneRows, err := r.db.Query(scenesQuery, "{"+strings.Join(actIDs, ",")+"}")
	if err != nil {
		return nil, err
	}
	defer sceneRows.Close()

	sceneMap := make(map[string]*entity.Scene)
	var sceneIDs []string
	for sceneRows.Next() {
		var scene entity.Scene
		if err := sceneRows.Scan(&scene.ID, &scene.ActID, &scene.SceneNumber, &scene.Setting); err != nil {
			return nil, err
		}
		scene.Elements = []*entity.ScriptElement{}
		if act, ok := actMap[scene.ActID]; ok {
			act.Scenes = append(act.Scenes, &scene)
			sceneMap[scene.ID] = &scene
			sceneIDs = append(sceneIDs, scene.ID)
		}
	}
	if len(sceneIDs) == 0 {
		return &fullProject, nil
	}

	elementsQuery := `SELECT element_id, scene_id, element_order, element_type, content, character_id FROM script_elements WHERE scene_id = ANY($1) ORDER BY element_order ASC`
	elementRows, err := r.db.Query(elementsQuery, "{"+strings.Join(sceneIDs, ",")+"}")
	if err != nil {
		return nil, err
	}
	defer elementRows.Close()

	for elementRows.Next() {
		var el entity.ScriptElement
		if err := elementRows.Scan(&el.ID, &el.SceneID, &el.ElementOrder, &el.ElementType, &el.Content, &el.CharacterID); err != nil {
			return nil, err
		}
		if scene, ok := sceneMap[el.SceneID]; ok {
			scene.Elements = append(scene.Elements, &el)
		}
	}

	return &fullProject, nil
}

func (r *postgresProjectRepository) GetFullProjectByIDForUser(projectID string, userID string) (*entity.FullProject, error) {
	// Check access
	accessQuery := `
		SELECT 1 FROM projects p 
		WHERE p.project_id = $1 AND (p.user_id = $2 OR EXISTS (
			SELECT 1 FROM project_collaborators pc 
			WHERE pc.project_id = p.project_id AND pc.user_id = $2
		))
	`
	var access int
	err := r.db.QueryRow(accessQuery, projectID, userID).Scan(&access)
	if err == sql.ErrNoRows {
		return nil, nil // No access
	}
	if err != nil {
		return nil, err
	}

	// Fetch full project
	return r.GetFullProjectByID(projectID)
}


func (r *postgresProjectRepository) GetByName(userID string, name string) (*entity.Project, error) {
	query := `SELECT project_id, user_id, project_name, description, is_starred, created_at, updated_at FROM projects WHERE user_id = $1 AND project_name = $2`
	var p entity.Project
	err := r.db.QueryRow(query, userID, name).Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Description, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

func (r *postgresProjectRepository) Create(project *entity.Project) error {
	query := `INSERT INTO projects (user_id, project_name, description) VALUES ($1, $2, $3) RETURNING project_id, is_starred, created_at, updated_at`
	return r.db.QueryRow(query, project.UserID, project.ProjectName, project.Description).Scan(&project.ID, &project.IsStarred, &project.CreatedAt, &project.UpdatedAt)
}

func (r *postgresProjectRepository) Update(project *entity.Project) (*entity.Project, error) {
	query := `UPDATE projects SET project_name = $1, description = $2, updated_at = $3 WHERE project_id = $4 AND user_id = $5 RETURNING project_id, user_id, project_name, description, is_starred, created_at, updated_at`
	var p entity.Project
	updatedAt := time.Now()
	err := r.db.QueryRow(query, project.ProjectName, project.Description, updatedAt, project.ID, project.UserID).Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Description, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt)
	return &p, err
}

func (r *postgresProjectRepository) Delete(projectID string, userID string) error {
	query := `DELETE FROM projects WHERE project_id = $1 AND user_id = $2`
	_, err := r.db.Exec(query, projectID, userID)
	return err
}

func (r *postgresProjectRepository) UpdateIsStarred(projectID string, userID string, isStarred bool) (*entity.Project, error) {
	query := `UPDATE projects SET is_starred = $1, updated_at = $2 WHERE project_id = $3 AND user_id = $4 RETURNING project_id, user_id, project_name, description, is_starred, created_at, updated_at`
	var p entity.Project
	updatedAt := time.Now()
	err := r.db.QueryRow(query, isStarred, updatedAt, projectID, userID).Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Description, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt)
	return &p, err
}

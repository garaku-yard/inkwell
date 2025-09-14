package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/l1roii/screenwriter/server/internal/entity"
)

type LaneRepository interface {
	CreateLane(lane *entity.Lane) (*entity.Lane, error)
	GetLanesByProjectID(projectID string) ([]*entity.Lane, error)
	UpdateLane(laneID string, updates map[string]any) error
	UpdateLaneOrder(projectID string, orderedLaneIDs []string) error
	GetProjectIDForLane(laneID string) (string, error)
}

type postgresLaneRepository struct {
	db *sql.DB
}

func NewLaneRepository(db *sql.DB) LaneRepository {
	return &postgresLaneRepository{db: db}
}

func (r *postgresLaneRepository) CreateLane(lane *entity.Lane) (*entity.Lane, error) {
	query := `
		INSERT INTO lanes (project_id, name, color, lane_order)
		VALUES ($1, $2, $3, $4)
		RETURNING lane_id`

	err := r.db.QueryRow(
		query,
		lane.ProjectID,
		lane.Name,
		lane.Color,
		lane.Order,
	).Scan(&lane.ID)
	if err != nil {
		return nil, err
	}

	return lane, nil
}

func (r *postgresLaneRepository) GetProjectIDForLane(laneID string) (string, error) {
	var projectID string
	err := r.db.QueryRow(`SELECT project_id FROM lanes WHERE lane_id = $1`, laneID).Scan(&projectID)
	return projectID, err
}

func (r *postgresLaneRepository) GetLanesByProjectID(projectID string) ([]*entity.Lane, error) {
	rows, err := r.db.Query(`
		SELECT lane_id, name, color, lane_order
		FROM lanes
		WHERE project_id = $1
		ORDER BY lane_order ASC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lanes []*entity.Lane
	for rows.Next() {
		var l entity.Lane
		if err := rows.Scan(&l.ID, &l.Name, &l.Color, &l.Order); err != nil {
			return nil, err
		}
		lanes = append(lanes, &l)
	}

	return lanes, nil
}

func (r *postgresLaneRepository) UpdateLane(laneID string, updates map[string]any) error {
	var setClauses []string
	var args []any
	argCount := 1

	for key, value := range updates {
		column := ""
		switch key {
		case "name":
			column = "name"
		case "color":
			column = "color"
		}

		if column != "" {
			setClauses = append(setClauses, fmt.Sprintf("%s = $%d", column, argCount))
			args = append(args, value)
			argCount++
		}
	}

	if len(setClauses) == 0 {
		return fmt.Errorf("no valid fields to update for lane")
	}

	args = append(args, laneID)
	query := fmt.Sprintf("UPDATE lanes SET %s WHERE lane_id = $%d", strings.Join(setClauses, ", "), argCount)

	_, err := r.db.Exec(query, args...)
	return err
}

func (r *postgresLaneRepository) UpdateLaneOrder(projectID string, orderedLaneIDs []string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`UPDATE lanes SET lane_order = $1 WHERE lane_id = $2 AND project_id = $3`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for i, laneID := range orderedLaneIDs {
		_, err := stmt.Exec(i, laneID, projectID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

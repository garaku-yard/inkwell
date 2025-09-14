package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/l1roii/screenwriter/server/internal/entity"
)

type BeatRepository interface {
	GetBeatBoard(projectID string) (*entity.BeatBoardData, error)
	CreateBeat(beat *entity.Beat) (*entity.Beat, error)
	UpdateBeat(beatID string, updates map[string]any) (*entity.Beat, error)
	DeleteBeat(beatID string) error
	CreateConnection(conn *entity.Connection) (*entity.Connection, error)
	DeleteConnection(connID string) error
	GetProjectIDForBeat(beatID string) (string, error)
	GetProjectIDForConnection(connID string) (string, error)
}

type postgresBeatRepository struct {
	db *sql.DB
}

func NewBeatRepository(db *sql.DB) BeatRepository {
	return &postgresBeatRepository{db: db}
}

func (r *postgresBeatRepository) GetProjectIDForBeat(beatID string) (string, error) {
	var projectID string
	err := r.db.QueryRow(`SELECT project_id FROM beats WHERE beat_id = $1`, beatID).Scan(&projectID)
	return projectID, err
}

// GetProjectIDForConnection finds the project associated with a connection.
func (r *postgresBeatRepository) GetProjectIDForConnection(connID string) (string, error) {
	var projectID string
	err := r.db.QueryRow(`SELECT project_id FROM beat_connections WHERE connection_id = $1`, connID).Scan(&projectID)
	return projectID, err
}

func (r *postgresBeatRepository) GetBeatBoard(projectID string) (*entity.BeatBoardData, error) {
	data := &entity.BeatBoardData{}

	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback() // Rollback on any error

	beats, err := r.getBeatsByProjectIDTx(tx, projectID)
	if err != nil {
		return nil, err
	}
	data.Beats = beats

	connections, err := r.getConnectionsByProjectIDTx(tx, projectID)
	if err != nil {
		return nil, err
	}
	data.Connections = connections

	lanes, err := r.getLanesByProjectIDTx(tx, projectID)
	if err != nil {
		return nil, err
	}
	data.Lanes = lanes

	outlineItems, err := r.getOutlineItemsByProjectIDTx(tx, projectID)
	if err != nil {
		return nil, err
	}
	data.OutlineItems = outlineItems

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return data, nil
}

func (r *postgresBeatRepository) getBeatsByProjectIDTx(tx *sql.Tx, projectID string) ([]*entity.Beat, error) {
	rows, err := tx.Query(`
		SELECT beat_id, title, description, scene_numbers, color, position_x, position_y, width, height, act_number, beat_order
		FROM beats WHERE project_id = $1 ORDER BY beat_order ASC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var beats []*entity.Beat
	for rows.Next() {
		var b entity.Beat
		if err := rows.Scan(&b.ID, &b.Title, &b.Description, &b.SceneNumbers, &b.Color, &b.PositionX, &b.PositionY, &b.Width, &b.Height, &b.Act, &b.Order); err != nil {
			return nil, err
		}
		b.Position.X = b.PositionX
		b.Position.Y = b.PositionY
		beats = append(beats, &b)
	}
	return beats, nil
}

func (r *postgresBeatRepository) getConnectionsByProjectIDTx(tx *sql.Tx, projectID string) ([]*entity.Connection, error) {
	rows, err := tx.Query(`
		SELECT connection_id, from_beat_id, to_beat_id, from_side, to_side
		FROM beat_connections WHERE project_id = $1`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var connections []*entity.Connection
	for rows.Next() {
		var c entity.Connection
		if err := rows.Scan(&c.ID, &c.FromId, &c.ToId, &c.FromSide, &c.ToSide); err != nil {
			return nil, err
		}
		connections = append(connections, &c)
	}
	return connections, nil
}

func (r *postgresBeatRepository) getLanesByProjectIDTx(tx *sql.Tx, projectID string) ([]*entity.Lane, error) {
	rows, err := tx.Query(`
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

func (r *postgresBeatRepository) getOutlineItemsByProjectIDTx(tx *sql.Tx, projectID string) ([]*entity.OutlineItem, error) {
	rows, err := tx.Query(`
		SELECT outline_item_id, beat_id, lane_id, item_order, timeline_position, width
		FROM outline_items
		WHERE project_id = $1
		ORDER BY item_order ASC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*entity.OutlineItem
	for rows.Next() {
		var i entity.OutlineItem
		if err := rows.Scan(&i.ID, &i.BeatID, &i.LaneID, &i.Order, &i.TimelinePosition, &i.Width); err != nil {
			return nil, err
		}
		items = append(items, &i)
	}
	return items, nil
}

func (r *postgresBeatRepository) CreateBeat(beat *entity.Beat) (*entity.Beat, error) {
	query := `
		INSERT INTO beats (project_id, title, description, scene_numbers, color, position_x, position_y, width, height, act_number, beat_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING beat_id`
	err := r.db.QueryRow(query, beat.ProjectID, beat.Title, beat.Description, beat.SceneNumbers, beat.Color, beat.Position.X, beat.Position.Y, beat.Width, beat.Height, beat.Act, beat.Order).Scan(&beat.ID)
	if err != nil {
		return nil, err
	}
	return beat, nil
}

func (r *postgresBeatRepository) UpdateBeat(beatID string, updates map[string]any) (*entity.Beat, error) {
	var setClauses []string
	var args []any
	argCount := 1

	for key, value := range updates {
		column := ""
		switch key {
		case "title":
			column = "title"
		case "description":
			column = "description"
		case "sceneNumbers":
			column = "scene_numbers"
		case "color":
			column = "color"
		case "width":
			column = "width"
		case "height":
			column = "height"
		case "act":
			column = "act_number"
		case "order":
			column = "beat_order"
		case "position":
			// Handle nested position object
			if pos, ok := value.(map[string]any); ok {
				if x, ok := pos["x"]; ok {
					setClauses = append(setClauses, fmt.Sprintf("position_x = $%d", argCount))
					args = append(args, x)
					argCount++
				}
				if y, ok := pos["y"]; ok {
					setClauses = append(setClauses, fmt.Sprintf("position_y = $%d", argCount))
					args = append(args, y)
					argCount++
				}
			}
			continue // Skip the generic handling below
		}

		if column != "" {
			setClauses = append(setClauses, fmt.Sprintf("%s = $%d", column, argCount))
			args = append(args, value)
			argCount++
		}
	}

	if len(setClauses) == 0 {
		return nil, fmt.Errorf("no valid fields to update")
	}

	args = append(args, beatID)
	query := fmt.Sprintf("UPDATE beats SET %s WHERE beat_id = $%d", strings.Join(setClauses, ", "), argCount)

	_, err := r.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}

	// For simplicity, we don't return the updated beat here, but you could add a SELECT query to do so.
	return nil, nil
}

func (r *postgresBeatRepository) DeleteBeat(beatID string) error {
	_, err := r.db.Exec(`DELETE FROM beats WHERE beat_id = $1`, beatID)
	return err
}

func (r *postgresBeatRepository) CreateConnection(conn *entity.Connection) (*entity.Connection, error) {
	query := `
		INSERT INTO beat_connections (project_id, from_beat_id, to_beat_id, from_side, to_side)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING connection_id`
	err := r.db.QueryRow(query, conn.ProjectID, conn.FromId, conn.ToId, conn.FromSide, conn.ToSide).Scan(&conn.ID)
	if err != nil {
		return nil, err
	}
	return conn, nil
}

func (r *postgresBeatRepository) DeleteConnection(connID string) error {
	_, err := r.db.Exec(`DELETE FROM beat_connections WHERE connection_id = $1`, connID)
	return err
}

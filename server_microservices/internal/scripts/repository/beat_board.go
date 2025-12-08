package repository

import (
	"context"
	"database/sql"
	"fmt"

	"scriptlith/server_microservices/internal/scripts/domain"

	"github.com/google/uuid"
)

// beatRepository implements BeatRepository
type beatRepository struct {
	db *sql.DB
}

func NewBeatRepository(db *sql.DB) BeatRepository {
	return &beatRepository{db: db}
}

func (r *beatRepository) CreateBeat(ctx context.Context, beat *domain.Beat) error {
	query := `
		INSERT INTO beats (beat_id, project_id, title, description, scene_numbers, color, 
			position_x, position_y, width, height, act_number, beat_order, start_page, end_page, image_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		RETURNING created_at, updated_at`

	err := r.db.QueryRowContext(ctx, query,
		beat.ID, beat.ProjectID, beat.Title, beat.Description, beat.SceneNumbers,
		beat.Color, beat.PositionX, beat.PositionY, beat.Width, beat.Height,
		beat.ActNumber, beat.Order, beat.StartPage, beat.EndPage, beat.ImageURL,
	).Scan(&beat.CreatedAt, &beat.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create beat: %w", err)
	}
	return nil
}

func (r *beatRepository) GetBeat(ctx context.Context, beatID uuid.UUID) (*domain.Beat, error) {
	query := `
		SELECT beat_id, project_id, title, description, scene_numbers, color,
			position_x, position_y, width, height, act_number, beat_order,
			start_page, end_page, image_url, created_at, updated_at
		FROM beats WHERE beat_id = $1`

	beat := &domain.Beat{}
	err := r.db.QueryRowContext(ctx, query, beatID).Scan(
		&beat.ID, &beat.ProjectID, &beat.Title, &beat.Description, &beat.SceneNumbers,
		&beat.Color, &beat.PositionX, &beat.PositionY, &beat.Width, &beat.Height,
		&beat.ActNumber, &beat.Order, &beat.StartPage, &beat.EndPage, &beat.ImageURL,
		&beat.CreatedAt, &beat.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("beat not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get beat: %w", err)
	}
	return beat, nil
}

func (r *beatRepository) GetProjectBeats(ctx context.Context, projectID uuid.UUID) ([]*domain.Beat, error) {
	query := `
		SELECT beat_id, project_id, title, description, scene_numbers, color,
			position_x, position_y, width, height, act_number, beat_order,
			start_page, end_page, image_url, created_at, updated_at
		FROM beats 
		WHERE project_id = $1
		ORDER BY beat_order, created_at`

	rows, err := r.db.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to get project beats: %w", err)
	}
	defer rows.Close()

	var beats []*domain.Beat
	for rows.Next() {
		beat := &domain.Beat{}
		err := rows.Scan(
			&beat.ID, &beat.ProjectID, &beat.Title, &beat.Description, &beat.SceneNumbers,
			&beat.Color, &beat.PositionX, &beat.PositionY, &beat.Width, &beat.Height,
			&beat.ActNumber, &beat.Order, &beat.StartPage, &beat.EndPage, &beat.ImageURL,
			&beat.CreatedAt, &beat.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan beat: %w", err)
		}
		beats = append(beats, beat)
	}
	return beats, nil
}

func (r *beatRepository) UpdateBeat(ctx context.Context, beat *domain.Beat) error {
	query := `
		UPDATE beats SET
			title = $1, description = $2, scene_numbers = $3, color = $4,
			position_x = $5, position_y = $6, width = $7, height = $8,
			act_number = $9, beat_order = $10, start_page = $11, end_page = $12,
			image_url = $13, updated_at = NOW()
		WHERE beat_id = $14`

	result, err := r.db.ExecContext(ctx, query,
		beat.Title, beat.Description, beat.SceneNumbers, beat.Color,
		beat.PositionX, beat.PositionY, beat.Width, beat.Height,
		beat.ActNumber, beat.Order, beat.StartPage, beat.EndPage, beat.ImageURL, beat.ID,
	)

	if err != nil {
		return fmt.Errorf("failed to update beat: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("beat not found")
	}
	return nil
}

func (r *beatRepository) DeleteBeat(ctx context.Context, beatID uuid.UUID) error {
	query := `DELETE FROM beats WHERE beat_id = $1`

	result, err := r.db.ExecContext(ctx, query, beatID)
	if err != nil {
		return fmt.Errorf("failed to delete beat: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("beat not found")
	}
	return nil
}

// connectionRepository implements ConnectionRepository
type connectionRepository struct {
	db *sql.DB
}

func NewConnectionRepository(db *sql.DB) ConnectionRepository {
	return &connectionRepository{db: db}
}

func (r *connectionRepository) CreateConnection(ctx context.Context, conn *domain.Connection) error {
	query := `
		INSERT INTO beat_connections (connection_id, project_id, from_beat_id, to_beat_id, from_side, to_side)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING created_at`

	err := r.db.QueryRowContext(ctx, query,
		conn.ID, conn.ProjectID, conn.FromID, conn.ToID, conn.FromSide, conn.ToSide,
	).Scan(&conn.CreatedAt)

	if err != nil {
		return fmt.Errorf("failed to create connection: %w", err)
	}
	return nil
}

func (r *connectionRepository) GetConnection(ctx context.Context, connID uuid.UUID) (*domain.Connection, error) {
	query := `
		SELECT connection_id, project_id, from_beat_id, to_beat_id, from_side, to_side, created_at
		FROM beat_connections WHERE connection_id = $1`

	conn := &domain.Connection{}
	err := r.db.QueryRowContext(ctx, query, connID).Scan(
		&conn.ID, &conn.ProjectID, &conn.FromID, &conn.ToID,
		&conn.FromSide, &conn.ToSide, &conn.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("connection not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get connection: %w", err)
	}
	return conn, nil
}

func (r *connectionRepository) GetProjectConnections(ctx context.Context, projectID uuid.UUID) ([]*domain.Connection, error) {
	query := `
		SELECT connection_id, project_id, from_beat_id, to_beat_id, from_side, to_side, created_at
		FROM beat_connections 
		WHERE project_id = $1`

	rows, err := r.db.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to get project connections: %w", err)
	}
	defer rows.Close()

	var connections []*domain.Connection
	for rows.Next() {
		conn := &domain.Connection{}
		err := rows.Scan(
			&conn.ID, &conn.ProjectID, &conn.FromID, &conn.ToID,
			&conn.FromSide, &conn.ToSide, &conn.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan connection: %w", err)
		}
		connections = append(connections, conn)
	}
	return connections, nil
}

func (r *connectionRepository) DeleteConnection(ctx context.Context, connID uuid.UUID) error {
	query := `DELETE FROM beat_connections WHERE connection_id = $1`

	result, err := r.db.ExecContext(ctx, query, connID)
	if err != nil {
		return fmt.Errorf("failed to delete connection: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("connection not found")
	}
	return nil
}

// laneRepository implements LaneRepository
type laneRepository struct {
	db *sql.DB
}

func NewLaneRepository(db *sql.DB) LaneRepository {
	return &laneRepository{db: db}
}

func (r *laneRepository) CreateLane(ctx context.Context, lane *domain.Lane) error {
	query := `
		INSERT INTO lanes (lane_id, project_id, name, color, lane_order)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING created_at, updated_at`

	err := r.db.QueryRowContext(ctx, query,
		lane.ID, lane.ProjectID, lane.Name, lane.Color, lane.Order,
	).Scan(&lane.CreatedAt, &lane.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create lane: %w", err)
	}
	return nil
}

func (r *laneRepository) GetLane(ctx context.Context, laneID uuid.UUID) (*domain.Lane, error) {
	query := `
		SELECT lane_id, project_id, name, color, lane_order, created_at, updated_at
		FROM lanes WHERE lane_id = $1`

	lane := &domain.Lane{}
	err := r.db.QueryRowContext(ctx, query, laneID).Scan(
		&lane.ID, &lane.ProjectID, &lane.Name, &lane.Color,
		&lane.Order, &lane.CreatedAt, &lane.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("lane not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get lane: %w", err)
	}
	return lane, nil
}

func (r *laneRepository) GetProjectLanes(ctx context.Context, projectID uuid.UUID) ([]*domain.Lane, error) {
	query := `
		SELECT lane_id, project_id, name, color, lane_order, created_at, updated_at
		FROM lanes 
		WHERE project_id = $1
		ORDER BY lane_order, created_at`

	rows, err := r.db.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to get project lanes: %w", err)
	}
	defer rows.Close()

	var lanes []*domain.Lane
	for rows.Next() {
		lane := &domain.Lane{}
		err := rows.Scan(
			&lane.ID, &lane.ProjectID, &lane.Name, &lane.Color,
			&lane.Order, &lane.CreatedAt, &lane.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan lane: %w", err)
		}
		lanes = append(lanes, lane)
	}
	return lanes, nil
}

func (r *laneRepository) UpdateLane(ctx context.Context, lane *domain.Lane) error {
	query := `
		UPDATE lanes SET
			name = $1, color = $2, lane_order = $3, updated_at = NOW()
		WHERE lane_id = $4`

	result, err := r.db.ExecContext(ctx, query,
		lane.Name, lane.Color, lane.Order, lane.ID,
	)

	if err != nil {
		return fmt.Errorf("failed to update lane: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("lane not found")
	}
	return nil
}

func (r *laneRepository) UpdateLaneOrder(ctx context.Context, projectID uuid.UUID, laneIDs []uuid.UUID) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	query := `UPDATE lanes SET lane_order = $1, updated_at = NOW() WHERE lane_id = $2 AND project_id = $3`

	for i, laneID := range laneIDs {
		_, err := tx.ExecContext(ctx, query, i, laneID, projectID)
		if err != nil {
			return fmt.Errorf("failed to update lane order: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}
	return nil
}

func (r *laneRepository) DeleteLane(ctx context.Context, laneID uuid.UUID) error {
	query := `DELETE FROM lanes WHERE lane_id = $1`

	result, err := r.db.ExecContext(ctx, query, laneID)
	if err != nil {
		return fmt.Errorf("failed to delete lane: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("lane not found")
	}
	return nil
}

// outlineItemRepository implements OutlineItemRepository
type outlineItemRepository struct {
	db *sql.DB
}

func NewOutlineItemRepository(db *sql.DB) OutlineItemRepository {
	return &outlineItemRepository{db: db}
}

func (r *outlineItemRepository) CreateOutlineItem(ctx context.Context, item *domain.OutlineItem) error {
	query := `
		INSERT INTO outline_items (outline_item_id, project_id, beat_id, lane_id, item_order, timeline_position, width)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING created_at, updated_at`

	err := r.db.QueryRowContext(ctx, query,
		item.ID, item.ProjectID, item.BeatID, item.LaneID,
		item.Order, item.TimelinePosition, item.Width,
	).Scan(&item.CreatedAt, &item.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to create outline item: %w", err)
	}
	return nil
}

func (r *outlineItemRepository) GetOutlineItem(ctx context.Context, itemID uuid.UUID) (*domain.OutlineItem, error) {
	query := `
		SELECT outline_item_id, project_id, beat_id, lane_id, item_order, 
			timeline_position, width, created_at, updated_at
		FROM outline_items WHERE outline_item_id = $1`

	item := &domain.OutlineItem{}
	err := r.db.QueryRowContext(ctx, query, itemID).Scan(
		&item.ID, &item.ProjectID, &item.BeatID, &item.LaneID,
		&item.Order, &item.TimelinePosition, &item.Width,
		&item.CreatedAt, &item.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("outline item not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get outline item: %w", err)
	}
	return item, nil
}

func (r *outlineItemRepository) GetProjectOutlineItems(ctx context.Context, projectID uuid.UUID) ([]*domain.OutlineItem, error) {
	query := `
		SELECT outline_item_id, project_id, beat_id, lane_id, item_order,
			timeline_position, width, created_at, updated_at
		FROM outline_items 
		WHERE project_id = $1
		ORDER BY lane_id, item_order`

	rows, err := r.db.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to get project outline items: %w", err)
	}
	defer rows.Close()

	var items []*domain.OutlineItem
	for rows.Next() {
		item := &domain.OutlineItem{}
		err := rows.Scan(
			&item.ID, &item.ProjectID, &item.BeatID, &item.LaneID,
			&item.Order, &item.TimelinePosition, &item.Width,
			&item.CreatedAt, &item.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan outline item: %w", err)
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *outlineItemRepository) UpdateOutlineItem(ctx context.Context, item *domain.OutlineItem) error {
	query := `
		UPDATE outline_items SET
			beat_id = $1, lane_id = $2, item_order = $3,
			timeline_position = $4, width = $5, updated_at = NOW()
		WHERE outline_item_id = $6`

	result, err := r.db.ExecContext(ctx, query,
		item.BeatID, item.LaneID, item.Order,
		item.TimelinePosition, item.Width, item.ID,
	)

	if err != nil {
		return fmt.Errorf("failed to update outline item: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("outline item not found")
	}
	return nil
}

func (r *outlineItemRepository) DeleteOutlineItem(ctx context.Context, itemID uuid.UUID) error {
	query := `DELETE FROM outline_items WHERE outline_item_id = $1`

	result, err := r.db.ExecContext(ctx, query, itemID)
	if err != nil {
		return fmt.Errorf("failed to delete outline item: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("outline item not found")
	}
	return nil
}

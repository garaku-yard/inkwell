package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/l1roii/screenwriter/server/internal/entity"
)

type OutlineItemRepository interface {
	CreateOutlineItem(item *entity.OutlineItem) (*entity.OutlineItem, error)
	UpdateOutlineItem(itemID string, updates map[string]any) error
	DeleteOutlineItem(itemID string) error
	GetProjectIDForOutlineItem(itemID string) (string, error)
	// Note: GetOutlineItemsByProjectID will be part of the BeatRepository's GetBeatBoard method
}

type postgresOutlineItemRepository struct {
	db *sql.DB
}

func NewOutlineItemRepository(db *sql.DB) OutlineItemRepository {
	return &postgresOutlineItemRepository{db: db}
}

func (r *postgresOutlineItemRepository) GetProjectIDForOutlineItem(itemID string) (string, error) {
	var projectID string
	err := r.db.QueryRow(`SELECT project_id FROM outline_items WHERE outline_item_id = $1`, itemID).Scan(&projectID)
	return projectID, err
}

func (r *postgresOutlineItemRepository) CreateOutlineItem(item *entity.OutlineItem) (*entity.OutlineItem, error) {
	query := `
		INSERT INTO outline_items (project_id, beat_id, lane_id, item_order, timeline_position, width)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING outline_item_id`

	err := r.db.QueryRow(
		query,
		item.ProjectID,
		item.BeatID,
		item.LaneID,
		item.Order,
		item.TimelinePosition,
		item.Width,
	).Scan(&item.ID)
	if err != nil {
		return nil, err
	}

	return item, nil
}

func (r *postgresOutlineItemRepository) UpdateOutlineItem(itemID string, updates map[string]any) error {
	var setClauses []string
	var args []any
	argCount := 1

	for key, value := range updates {
		column := ""
		switch key {
		case "laneId":
			column = "lane_id"
		case "order":
			column = "item_order"
		case "timelinePosition":
			column = "timeline_position"
		case "width":
			column = "width"
		}

		if column != "" {
			setClauses = append(setClauses, fmt.Sprintf("%s = $%d", column, argCount))
			args = append(args, value)
			argCount++
		}
	}

	if len(setClauses) == 0 {
		return fmt.Errorf("no valid fields to update for outline item")
	}

	args = append(args, itemID)
	query := fmt.Sprintf("UPDATE outline_items SET %s WHERE outline_item_id = $%d", strings.Join(setClauses, ", "), argCount)

	_, err := r.db.Exec(query, args...)
	return err
}

func (r *postgresOutlineItemRepository) DeleteOutlineItem(itemID string) error {
	_, err := r.db.Exec(`DELETE FROM outline_items WHERE outline_item_id = $1`, itemID)
	return err
}

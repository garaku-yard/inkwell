package service

import (
	"context"
	"fmt"

	"inkwell/server/internal/scripts/domain"
	"inkwell/server/internal/scripts/repository"

	"github.com/google/uuid"
)

// BeatBoardService defines business logic for beat board operations
type BeatBoardService interface {
	// Beat operations
	CreateBeat(ctx context.Context, projectID, userID uuid.UUID, beat *domain.Beat) (*domain.Beat, error)
	GetBeat(ctx context.Context, beatID, userID uuid.UUID) (*domain.Beat, error)
	GetProjectBeatBoard(ctx context.Context, projectID, userID uuid.UUID) (*domain.BeatBoardData, error)
	UpdateBeat(ctx context.Context, beatID, userID uuid.UUID, updates *domain.Beat) (*domain.Beat, error)
	DeleteBeat(ctx context.Context, beatID, userID uuid.UUID) error

	// Connection operations
	CreateConnection(ctx context.Context, projectID, userID uuid.UUID, conn *domain.Connection) (*domain.Connection, error)
	DeleteConnection(ctx context.Context, connID, userID uuid.UUID) error

	// Lane operations
	CreateLane(ctx context.Context, projectID, userID uuid.UUID, lane *domain.Lane) (*domain.Lane, error)
	GetProjectLanes(ctx context.Context, projectID, userID uuid.UUID) ([]*domain.Lane, error)
	UpdateLane(ctx context.Context, laneID, userID uuid.UUID, updates *domain.Lane) (*domain.Lane, error)
	UpdateLaneOrder(ctx context.Context, projectID, userID uuid.UUID, laneIDs []uuid.UUID) error
	DeleteLane(ctx context.Context, laneID, userID uuid.UUID) error

	// Outline item operations
	CreateOutlineItem(ctx context.Context, projectID, userID uuid.UUID, item *domain.OutlineItem) (*domain.OutlineItem, error)
	UpdateOutlineItem(ctx context.Context, itemID, userID uuid.UUID, updates *domain.OutlineItem) (*domain.OutlineItem, error)
	DeleteOutlineItem(ctx context.Context, itemID, userID uuid.UUID) error

	CreateDrawing(ctx context.Context, projectID, userID uuid.UUID, d *domain.Drawing) (*domain.Drawing, error)
	UpdateDrawing(ctx context.Context, drawingID, userID uuid.UUID, updates *domain.DrawingPatch) (*domain.Drawing, error)
	DeleteDrawing(ctx context.Context, drawingID, userID uuid.UUID) error
}

type beatBoardService struct {
	repo *repository.Repository
}

// NewBeatBoardService creates a new BeatBoardService instance
func NewBeatBoardService(repo *repository.Repository) BeatBoardService {
	return &beatBoardService{repo: repo}
}

// CreateBeat creates a new beat for a project
func (s *beatBoardService) CreateBeat(ctx context.Context, projectID, userID uuid.UUID, beat *domain.Beat) (*domain.Beat, error) {
	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	beat.ID = uuid.New()
	beat.ProjectID = projectID

	if err := s.repo.Beat.CreateBeat(ctx, beat); err != nil {
		return nil, fmt.Errorf("failed to create beat: %w", err)
	}

	return beat, nil
}

// GetBeat retrieves a beat by ID
func (s *beatBoardService) GetBeat(ctx context.Context, beatID, userID uuid.UUID) (*domain.Beat, error) {
	beat, err := s.repo.Beat.GetBeat(ctx, beatID)
	if err != nil {
		return nil, err
	}

	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, beat.ProjectID, userID); err != nil {
		return nil, err
	}

	return beat, nil
}

// GetProjectBeatBoard retrieves all beat board data for a project
func (s *beatBoardService) GetProjectBeatBoard(ctx context.Context, projectID, userID uuid.UUID) (*domain.BeatBoardData, error) {
	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	// Fetch all beat board data in parallel
	beatsCh := make(chan []*domain.Beat, 1)
	connsCh := make(chan []*domain.Connection, 1)
	lanesCh := make(chan []*domain.Lane, 1)
	itemsCh := make(chan []*domain.OutlineItem, 1)
	drawingsCh := make(chan []*domain.Drawing, 1)
	errCh := make(chan error, 5)

	go func() {
		beats, err := s.repo.Beat.GetProjectBeats(ctx, projectID)
		if err != nil {
			errCh <- err
			return
		}
		beatsCh <- beats
	}()

	go func() {
		conns, err := s.repo.Connection.GetProjectConnections(ctx, projectID)
		if err != nil {
			errCh <- err
			return
		}
		connsCh <- conns
	}()

	go func() {
		lanes, err := s.repo.Lane.GetProjectLanes(ctx, projectID)
		if err != nil {
			errCh <- err
			return
		}
		lanesCh <- lanes
	}()

	go func() {
		items, err := s.repo.OutlineItem.GetProjectOutlineItems(ctx, projectID)
		if err != nil {
			errCh <- err
			return
		}
		itemsCh <- items
	}()

	go func() {
		drawings, err := s.repo.Drawing.GetProjectDrawings(ctx, projectID)
		if err != nil {
			errCh <- err
			return
		}
		drawingsCh <- drawings
	}()

	// Collect results
	beatBoard := &domain.BeatBoardData{}
	for i := 0; i < 5; i++ {
		select {
		case beats := <-beatsCh:
			beatBoard.Beats = beats
		case conns := <-connsCh:
			beatBoard.Connections = conns
		case lanes := <-lanesCh:
			beatBoard.Lanes = lanes
		case items := <-itemsCh:
			beatBoard.OutlineItems = items
		case drawings := <-drawingsCh:
			beatBoard.Drawings = drawings
		case err := <-errCh:
			return nil, fmt.Errorf("failed to fetch beat board data: %w", err)
		}
	}

	return beatBoard, nil
}

// UpdateBeat updates an existing beat
func (s *beatBoardService) UpdateBeat(ctx context.Context, beatID, userID uuid.UUID, updates *domain.Beat) (*domain.Beat, error) {
	// Get existing beat
	beat, err := s.repo.Beat.GetBeat(ctx, beatID)
	if err != nil {
		return nil, err
	}

	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, beat.ProjectID, userID); err != nil {
		return nil, err
	}

	// Update fields
	if updates.Title != "" {
		beat.Title = updates.Title
	}
	if updates.Description != "" {
		beat.Description = updates.Description
	}
	if updates.SceneNumbers != "" {
		beat.SceneNumbers = updates.SceneNumbers
	}
	if updates.Color != "" {
		beat.Color = updates.Color
	}
	if updates.PositionX != 0 {
		beat.PositionX = updates.PositionX
	}
	if updates.PositionY != 0 {
		beat.PositionY = updates.PositionY
	}
	if updates.Width != 0 {
		beat.Width = updates.Width
	}
	if updates.Height != 0 {
		beat.Height = updates.Height
	}
	if updates.ActNumber != 0 {
		beat.ActNumber = updates.ActNumber
	}
	if updates.Order != 0 {
		beat.Order = updates.Order
	}
	if updates.StartPage != 0 {
		beat.StartPage = updates.StartPage
	}
	if updates.EndPage != 0 {
		beat.EndPage = updates.EndPage
	}
	if updates.ImageURL != nil {
		beat.ImageURL = updates.ImageURL
	}

	if err := s.repo.Beat.UpdateBeat(ctx, beat); err != nil {
		return nil, fmt.Errorf("failed to update beat: %w", err)
	}

	return beat, nil
}

// DeleteBeat deletes a beat
func (s *beatBoardService) DeleteBeat(ctx context.Context, beatID, userID uuid.UUID) error {
	// Get existing beat
	beat, err := s.repo.Beat.GetBeat(ctx, beatID)
	if err != nil {
		return err
	}

	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, beat.ProjectID, userID); err != nil {
		return err
	}

	if err := s.repo.Beat.DeleteBeat(ctx, beatID); err != nil {
		return fmt.Errorf("failed to delete beat: %w", err)
	}

	return nil
}

// CreateConnection creates a new connection between beats
func (s *beatBoardService) CreateConnection(ctx context.Context, projectID, userID uuid.UUID, conn *domain.Connection) (*domain.Connection, error) {
	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	conn.ID = uuid.New()
	conn.ProjectID = projectID

	if err := s.repo.Connection.CreateConnection(ctx, conn); err != nil {
		return nil, fmt.Errorf("failed to create connection: %w", err)
	}

	return conn, nil
}

// DeleteConnection deletes a connection
func (s *beatBoardService) DeleteConnection(ctx context.Context, connID, userID uuid.UUID) error {
	// Get existing connection
	conn, err := s.repo.Connection.GetConnection(ctx, connID)
	if err != nil {
		return err
	}

	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, conn.ProjectID, userID); err != nil {
		return err
	}

	if err := s.repo.Connection.DeleteConnection(ctx, connID); err != nil {
		return fmt.Errorf("failed to delete connection: %w", err)
	}

	return nil
}

// CreateLane creates a new lane for a project
func (s *beatBoardService) CreateLane(ctx context.Context, projectID, userID uuid.UUID, lane *domain.Lane) (*domain.Lane, error) {
	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	lane.ID = uuid.New()
	lane.ProjectID = projectID

	if err := s.repo.Lane.CreateLane(ctx, lane); err != nil {
		return nil, fmt.Errorf("failed to create lane: %w", err)
	}

	return lane, nil
}

// GetProjectLanes retrieves all lanes for a project
func (s *beatBoardService) GetProjectLanes(ctx context.Context, projectID, userID uuid.UUID) ([]*domain.Lane, error) {
	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	lanes, err := s.repo.Lane.GetProjectLanes(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to get lanes: %w", err)
	}

	return lanes, nil
}

// UpdateLane updates an existing lane
func (s *beatBoardService) UpdateLane(ctx context.Context, laneID, userID uuid.UUID, updates *domain.Lane) (*domain.Lane, error) {
	// Get existing lane
	lane, err := s.repo.Lane.GetLane(ctx, laneID)
	if err != nil {
		return nil, err
	}

	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, lane.ProjectID, userID); err != nil {
		return nil, err
	}

	// Update fields
	if updates.Name != "" {
		lane.Name = updates.Name
	}
	if updates.Color != "" {
		lane.Color = updates.Color
	}
	if updates.Order != 0 {
		lane.Order = updates.Order
	}

	if err := s.repo.Lane.UpdateLane(ctx, lane); err != nil {
		return nil, fmt.Errorf("failed to update lane: %w", err)
	}

	return lane, nil
}

// UpdateLaneOrder updates the order of lanes in a project
func (s *beatBoardService) UpdateLaneOrder(ctx context.Context, projectID, userID uuid.UUID, laneIDs []uuid.UUID) error {
	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return err
	}

	if err := s.repo.Lane.UpdateLaneOrder(ctx, projectID, laneIDs); err != nil {
		return fmt.Errorf("failed to update lane order: %w", err)
	}

	return nil
}

// DeleteLane deletes a lane
func (s *beatBoardService) DeleteLane(ctx context.Context, laneID, userID uuid.UUID) error {
	// Get existing lane
	lane, err := s.repo.Lane.GetLane(ctx, laneID)
	if err != nil {
		return err
	}

	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, lane.ProjectID, userID); err != nil {
		return err
	}

	if err := s.repo.Lane.DeleteLane(ctx, laneID); err != nil {
		return fmt.Errorf("failed to delete lane: %w", err)
	}

	return nil
}

// CreateOutlineItem creates a new outline item
func (s *beatBoardService) CreateOutlineItem(ctx context.Context, projectID, userID uuid.UUID, item *domain.OutlineItem) (*domain.OutlineItem, error) {
	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	item.ID = uuid.New()
	item.ProjectID = projectID

	if err := s.repo.OutlineItem.CreateOutlineItem(ctx, item); err != nil {
		return nil, fmt.Errorf("failed to create outline item: %w", err)
	}

	return item, nil
}

// UpdateOutlineItem updates an existing outline item
func (s *beatBoardService) UpdateOutlineItem(ctx context.Context, itemID, userID uuid.UUID, updates *domain.OutlineItem) (*domain.OutlineItem, error) {
	// Get existing item
	item, err := s.repo.OutlineItem.GetOutlineItem(ctx, itemID)
	if err != nil {
		return nil, err
	}

	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, item.ProjectID, userID); err != nil {
		return nil, err
	}

	// Update fields
	if updates.BeatID != uuid.Nil {
		item.BeatID = updates.BeatID
	}
	if updates.LaneID != uuid.Nil {
		item.LaneID = updates.LaneID
	}
	if updates.Order != 0 {
		item.Order = updates.Order
	}
	if updates.TimelinePosition != 0 {
		item.TimelinePosition = updates.TimelinePosition
	}
	if updates.Width != 0 {
		item.Width = updates.Width
	}

	if err := s.repo.OutlineItem.UpdateOutlineItem(ctx, item); err != nil {
		return nil, fmt.Errorf("failed to update outline item: %w", err)
	}

	return item, nil
}

// DeleteOutlineItem deletes an outline item
func (s *beatBoardService) DeleteOutlineItem(ctx context.Context, itemID, userID uuid.UUID) error {
	// Get existing item
	item, err := s.repo.OutlineItem.GetOutlineItem(ctx, itemID)
	if err != nil {
		return err
	}

	// Verify user has access to the project
	if err := s.verifyProjectAccess(ctx, item.ProjectID, userID); err != nil {
		return err
	}

	if err := s.repo.OutlineItem.DeleteOutlineItem(ctx, itemID); err != nil {
		return fmt.Errorf("failed to delete outline item: %w", err)
	}

	return nil
}

// verifyProjectAccess checks if a user has access to a project. A Nil userID is
// the collaborator bypass sentinel: the gateway resolves project access (owner or
// active collaborator) via the collab service before forwarding the call and
// signals a confirmed collaborator by passing an empty user_id. This mirrors
// scriptsService.verifyProjectAccess so scenes, elements, and the beat board all
// share one access model.
func (s *beatBoardService) verifyProjectAccess(ctx context.Context, projectID, userID uuid.UUID) error {
	if userID == uuid.Nil {
		return nil
	}

	project, err := s.repo.Project.GetProjectByID(ctx, projectID)
	if err != nil {
		return fmt.Errorf("project not found: %w", err)
	}

	if project.OwnerID == userID {
		return nil
	}

	return fmt.Errorf("user does not have access to this project")
}

// ─── Drawings (decisions/0022) ───────────────────────────────────────────────

// CreateDrawing adds one shape to a project's drawing layer.
func (s *beatBoardService) CreateDrawing(ctx context.Context, projectID, userID uuid.UUID, d *domain.Drawing) (*domain.Drawing, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	d.ID = uuid.New()
	d.ProjectID = projectID
	if d.Kind == "" {
		d.Kind = "pen"
	}
	if d.Data == "" {
		d.Data = "{}"
	}

	if err := s.repo.Drawing.CreateDrawing(ctx, d); err != nil {
		return nil, fmt.Errorf("failed to create drawing: %w", err)
	}
	return d, nil
}

// UpdateDrawing applies a partial update. Only the fields present on the patch
// are touched — see domain.DrawingPatch for why this doesn't use the zero-value
// sentinel the neighbouring updates do.
func (s *beatBoardService) UpdateDrawing(ctx context.Context, drawingID, userID uuid.UUID, updates *domain.DrawingPatch) (*domain.Drawing, error) {
	d, err := s.repo.Drawing.GetDrawing(ctx, drawingID)
	if err != nil {
		return nil, err
	}

	if err := s.verifyProjectAccess(ctx, d.ProjectID, userID); err != nil {
		return nil, err
	}

	if updates != nil {
		if updates.Kind != nil {
			d.Kind = *updates.Kind
		}
		if updates.Data != nil {
			d.Data = *updates.Data
		}
		if updates.Order != nil {
			d.Order = *updates.Order
		}
	}

	if err := s.repo.Drawing.UpdateDrawing(ctx, d); err != nil {
		return nil, fmt.Errorf("failed to update drawing: %w", err)
	}
	return d, nil
}

// DeleteDrawing soft-deletes a shape; the tombstone carries the erase to other devices.
func (s *beatBoardService) DeleteDrawing(ctx context.Context, drawingID, userID uuid.UUID) error {
	d, err := s.repo.Drawing.GetDrawing(ctx, drawingID)
	if err != nil {
		return err
	}

	if err := s.verifyProjectAccess(ctx, d.ProjectID, userID); err != nil {
		return err
	}

	if err := s.repo.Drawing.DeleteDrawing(ctx, drawingID); err != nil {
		return fmt.Errorf("failed to delete drawing: %w", err)
	}
	return nil
}

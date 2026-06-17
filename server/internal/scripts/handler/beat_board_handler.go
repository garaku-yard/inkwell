package handler

import (
	"context"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/scripts/domain"
	"inkwell/server/internal/scripts/service"
	"inkwell/server/pkg/grpc/common"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// BeatBoardHandler implements the beat-board subset of the ScriptsService gRPC
// interface. It handles beats (story cards on a free-form canvas), directional
// connections between beats, swim-lane organisation, and outline items that place
// beats on a timeline within a lane.
type BeatBoardHandler struct {
	service service.BeatBoardService
}

// NewBeatBoardHandler creates a BeatBoardHandler backed by the provided service.
func NewBeatBoardHandler(svc service.BeatBoardService) *BeatBoardHandler {
	return &BeatBoardHandler{
		service: svc,
	}
}

// CreateBeat adds a new beat card to a project's beat board. Position and size
// values (PositionX, PositionY, Width, Height) are in pixels as set by the
// canvas editor. Both project_id and user_id are required.
func (h *BeatBoardHandler) CreateBeat(ctx context.Context, req *scriptspb.CreateBeatRequest) (*scriptspb.CreateBeatResponse, error) {
	if req.ProjectId == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}

	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	beat := &domain.Beat{
		Title:        req.Title,
		Description:  req.Description,
		SceneNumbers: req.SceneNumbers,
		Color:        req.Color,
		PositionX:    int32(req.PositionX),
		PositionY:    int32(req.PositionY),
		Width:        int32(req.Width),
		Height:       int32(req.Height),
		ActNumber:    req.ActNumber,
		Order:        req.Order,
		StartPage:    req.StartPage,
		EndPage:      req.EndPage,
		ImageURL:     req.ImageUrl,
	}

	created, err := h.service.CreateBeat(ctx, projectID, userID, beat)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.CreateBeatResponse{
		Beat: convertBeatToProto(created),
	}, nil
}

// GetBeat retrieves a single beat by ID. The service enforces that the caller
// has read access to the beat's parent project.
func (h *BeatBoardHandler) GetBeat(ctx context.Context, req *scriptspb.GetBeatRequest) (*scriptspb.GetBeatResponse, error) {
	if req.BeatId == "" {
		return nil, status.Error(codes.InvalidArgument, "beat_id is required")
	}

	beatID, err := uuid.Parse(req.BeatId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid beat_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	beat, err := h.service.GetBeat(ctx, beatID, userID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.GetBeatResponse{
		Beat: convertBeatToProto(beat),
	}, nil
}

// GetProjectBeatBoard returns all beat-board data for a project in a single
// response: beats, connections, lanes, and outline items. This is the primary
// load call for the beat-board editor.
func (h *BeatBoardHandler) GetProjectBeatBoard(ctx context.Context, req *scriptspb.GetProjectBeatBoardRequest) (*scriptspb.GetProjectBeatBoardResponse, error) {
	if req.ProjectId == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}

	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	beatBoard, err := h.service.GetProjectBeatBoard(ctx, projectID, userID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.GetProjectBeatBoardResponse{
		BeatBoard: convertBeatBoardToProto(beatBoard),
	}, nil
}

// UpdateBeat applies a partial update to a beat. Only non-nil optional fields
// are forwarded to the service; omitted fields are left unchanged. Position and
// size fields are in pixels.
func (h *BeatBoardHandler) UpdateBeat(ctx context.Context, req *scriptspb.UpdateBeatRequest) (*scriptspb.UpdateBeatResponse, error) {
	if req.BeatId == "" {
		return nil, status.Error(codes.InvalidArgument, "beat_id is required")
	}

	beatID, err := uuid.Parse(req.BeatId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid beat_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	updates := &domain.Beat{}
	if req.Title != nil {
		updates.Title = *req.Title
	}
	if req.Description != nil {
		updates.Description = *req.Description
	}
	if req.SceneNumbers != nil {
		updates.SceneNumbers = *req.SceneNumbers
	}
	if req.Color != nil {
		updates.Color = *req.Color
	}
	if req.PositionX != nil {
		updates.PositionX = int32(*req.PositionX)
	}
	if req.PositionY != nil {
		updates.PositionY = int32(*req.PositionY)
	}
	if req.Width != nil {
		updates.Width = int32(*req.Width)
	}
	if req.Height != nil {
		updates.Height = int32(*req.Height)
	}
	if req.ActNumber != nil {
		updates.ActNumber = *req.ActNumber
	}
	if req.Order != nil {
		updates.Order = *req.Order
	}
	if req.StartPage != nil {
		updates.StartPage = *req.StartPage
	}
	if req.EndPage != nil {
		updates.EndPage = *req.EndPage
	}
	if req.ImageUrl != nil {
		updates.ImageURL = req.ImageUrl
	}

	updated, err := h.service.UpdateBeat(ctx, beatID, userID, updates)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.UpdateBeatResponse{
		Beat: convertBeatToProto(updated),
	}, nil
}

// DeleteBeat permanently removes a beat. Any connections referencing this beat
// should be removed by the service layer before returning success.
func (h *BeatBoardHandler) DeleteBeat(ctx context.Context, req *scriptspb.DeleteBeatRequest) (*scriptspb.DeleteBeatResponse, error) {
	if req.BeatId == "" {
		return nil, status.Error(codes.InvalidArgument, "beat_id is required")
	}

	beatID, err := uuid.Parse(req.BeatId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid beat_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	if err := h.service.DeleteBeat(ctx, beatID, userID); err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.DeleteBeatResponse{Success: true}, nil
}

// CreateConnection creates a directional edge between two beats on the canvas.
// from_side and to_side indicate which side of each beat card the edge attaches to
// (e.g. "left", "right", "top", "bottom").
func (h *BeatBoardHandler) CreateConnection(ctx context.Context, req *scriptspb.CreateConnectionRequest) (*scriptspb.CreateConnectionResponse, error) {
	if req.ProjectId == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}

	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	fromID, err := uuid.Parse(req.FromBeatId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid from_beat_id: %v", err)
	}

	toID, err := uuid.Parse(req.ToBeatId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid to_beat_id: %v", err)
	}

	conn := &domain.Connection{
		FromID:   fromID,
		ToID:     toID,
		FromSide: req.FromSide,
		ToSide:   req.ToSide,
	}

	created, err := h.service.CreateConnection(ctx, projectID, userID, conn)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.CreateConnectionResponse{
		Connection: convertConnectionToProto(created),
	}, nil
}

// DeleteConnection removes a directional edge between two beats.
func (h *BeatBoardHandler) DeleteConnection(ctx context.Context, req *scriptspb.DeleteConnectionRequest) (*scriptspb.DeleteConnectionResponse, error) {
	if req.ConnectionId == "" {
		return nil, status.Error(codes.InvalidArgument, "connection_id is required")
	}

	connID, err := uuid.Parse(req.ConnectionId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid connection_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	if err := h.service.DeleteConnection(ctx, connID, userID); err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.DeleteConnectionResponse{Success: true}, nil
}

// CreateLane adds a new swim lane to the beat-board timeline. Lanes group beats
// by story thread, character arc, or any other authorial dimension.
func (h *BeatBoardHandler) CreateLane(ctx context.Context, req *scriptspb.CreateLaneRequest) (*scriptspb.CreateLaneResponse, error) {
	if req.ProjectId == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}

	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	lane := &domain.Lane{
		Name:  req.Name,
		Color: req.Color,
		Order: req.Order,
	}

	created, err := h.service.CreateLane(ctx, projectID, userID, lane)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.CreateLaneResponse{
		Lane: convertLaneToProto(created),
	}, nil
}

// GetProjectLanes returns all swim lanes for a project, ordered by their position.
func (h *BeatBoardHandler) GetProjectLanes(ctx context.Context, req *scriptspb.GetProjectLanesRequest) (*scriptspb.GetProjectLanesResponse, error) {
	if req.ProjectId == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}

	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	lanes, err := h.service.GetProjectLanes(ctx, projectID, userID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	protoLanes := make([]*scriptspb.Lane, len(lanes))
	for i, lane := range lanes {
		protoLanes[i] = convertLaneToProto(lane)
	}

	return &scriptspb.GetProjectLanesResponse{
		Lanes: protoLanes,
	}, nil
}

// UpdateLane applies a partial update to a lane. Only non-nil optional fields
// (Name, Color, Order) are forwarded; omitted fields are left unchanged.
func (h *BeatBoardHandler) UpdateLane(ctx context.Context, req *scriptspb.UpdateLaneRequest) (*scriptspb.UpdateLaneResponse, error) {
	if req.LaneId == "" {
		return nil, status.Error(codes.InvalidArgument, "lane_id is required")
	}

	laneID, err := uuid.Parse(req.LaneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid lane_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	updates := &domain.Lane{}
	if req.Name != nil {
		updates.Name = *req.Name
	}
	if req.Color != nil {
		updates.Color = *req.Color
	}
	if req.Order != nil {
		updates.Order = *req.Order
	}

	updated, err := h.service.UpdateLane(ctx, laneID, userID, updates)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.UpdateLaneResponse{
		Lane: convertLaneToProto(updated),
	}, nil
}

// UpdateLaneOrder reorders all lanes for a project in a single atomic call.
// lane_ids must contain all lane IDs for the project in the desired order.
func (h *BeatBoardHandler) UpdateLaneOrder(ctx context.Context, req *scriptspb.UpdateLaneOrderRequest) (*scriptspb.UpdateLaneOrderResponse, error) {
	if req.ProjectId == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}

	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	laneIDs := make([]uuid.UUID, len(req.LaneIds))
	for i, idStr := range req.LaneIds {
		id, err := uuid.Parse(idStr)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid lane_id at index %d: %v", i, err)
		}
		laneIDs[i] = id
	}

	if err := h.service.UpdateLaneOrder(ctx, projectID, userID, laneIDs); err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.UpdateLaneOrderResponse{Success: true}, nil
}

// DeleteLane permanently removes a swim lane from the beat board.
func (h *BeatBoardHandler) DeleteLane(ctx context.Context, req *scriptspb.DeleteLaneRequest) (*scriptspb.DeleteLaneResponse, error) {
	if req.LaneId == "" {
		return nil, status.Error(codes.InvalidArgument, "lane_id is required")
	}

	laneID, err := uuid.Parse(req.LaneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid lane_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	if err := h.service.DeleteLane(ctx, laneID, userID); err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.DeleteLaneResponse{Success: true}, nil
}

// CreateOutlineItem places a beat on a lane at a specific position in the
// timeline. timeline_position is a fractional value (0.0–1.0) representing
// left-to-right placement within the lane; width is in the same unit.
func (h *BeatBoardHandler) CreateOutlineItem(ctx context.Context, req *scriptspb.CreateOutlineItemRequest) (*scriptspb.CreateOutlineItemResponse, error) {
	if req.ProjectId == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}

	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	beatID, err := uuid.Parse(req.BeatId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid beat_id: %v", err)
	}

	laneID, err := uuid.Parse(req.LaneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid lane_id: %v", err)
	}

	item := &domain.OutlineItem{
		BeatID:           beatID,
		LaneID:           laneID,
		Order:            req.Order,
		TimelinePosition: req.TimelinePosition,
		Width:            req.Width,
	}

	created, err := h.service.CreateOutlineItem(ctx, projectID, userID, item)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.CreateOutlineItemResponse{
		OutlineItem: convertOutlineItemToProto(created),
	}, nil
}

// UpdateOutlineItem applies a partial update to an outline item. Non-nil fields
// (BeatId, LaneId, Order, TimelinePosition, Width) are forwarded to the service.
func (h *BeatBoardHandler) UpdateOutlineItem(ctx context.Context, req *scriptspb.UpdateOutlineItemRequest) (*scriptspb.UpdateOutlineItemResponse, error) {
	if req.OutlineItemId == "" {
		return nil, status.Error(codes.InvalidArgument, "outline_item_id is required")
	}

	itemID, err := uuid.Parse(req.OutlineItemId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid outline_item_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	updates := &domain.OutlineItem{}
	if req.BeatId != nil {
		beatID, err := uuid.Parse(*req.BeatId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid beat_id: %v", err)
		}
		updates.BeatID = beatID
	}
	if req.LaneId != nil {
		laneID, err := uuid.Parse(*req.LaneId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid lane_id: %v", err)
		}
		updates.LaneID = laneID
	}
	if req.Order != nil {
		updates.Order = *req.Order
	}
	if req.TimelinePosition != nil {
		updates.TimelinePosition = *req.TimelinePosition
	}
	if req.Width != nil {
		updates.Width = *req.Width
	}

	updated, err := h.service.UpdateOutlineItem(ctx, itemID, userID, updates)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.UpdateOutlineItemResponse{
		OutlineItem: convertOutlineItemToProto(updated),
	}, nil
}

// DeleteOutlineItem removes a beat's placement from its lane on the timeline.
// The beat itself is not deleted.
func (h *BeatBoardHandler) DeleteOutlineItem(ctx context.Context, req *scriptspb.DeleteOutlineItemRequest) (*scriptspb.DeleteOutlineItemResponse, error) {
	if req.OutlineItemId == "" {
		return nil, status.Error(codes.InvalidArgument, "outline_item_id is required")
	}

	itemID, err := uuid.Parse(req.OutlineItemId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid outline_item_id: %v", err)
	}

	// userID is optional — an empty user_id is the collaborator bypass sentinel
	// (the gateway confirms project access before forwarding the call).
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	if err := h.service.DeleteOutlineItem(ctx, itemID, userID); err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.DeleteOutlineItemResponse{Success: true}, nil
}

// convertBeatToProto maps a domain Beat to the scripts proto Beat message.
// PositionX, PositionY, Width, and Height are stored as int32 in the domain
// but emitted as float64 in the proto to match the canvas editor's coordinate system.
func convertBeatToProto(beat *domain.Beat) *scriptspb.Beat {
	return &scriptspb.Beat{
		Id:           beat.ID.String(),
		ProjectId:    beat.ProjectID.String(),
		Title:        beat.Title,
		Description:  beat.Description,
		SceneNumbers: beat.SceneNumbers,
		Color:        beat.Color,
		PositionX:    float64(beat.PositionX),
		PositionY:    float64(beat.PositionY),
		Width:        float64(beat.Width),
		Height:       float64(beat.Height),
		ActNumber:    beat.ActNumber,
		Order:        beat.Order,
		StartPage:    beat.StartPage,
		EndPage:      beat.EndPage,
		ImageUrl:     beat.ImageURL,
		CreatedAt:    convertTimestampToProto(beat.CreatedAt),
		UpdatedAt:    convertTimestampToProto(beat.UpdatedAt),
	}
}

// convertConnectionToProto maps a domain Connection to the scripts proto Connection message.
func convertConnectionToProto(conn *domain.Connection) *scriptspb.Connection {
	return &scriptspb.Connection{
		Id:         conn.ID.String(),
		ProjectId:  conn.ProjectID.String(),
		FromBeatId: conn.FromID.String(),
		ToBeatId:   conn.ToID.String(),
		FromSide:   conn.FromSide,
		ToSide:     conn.ToSide,
		CreatedAt:  convertTimestampToProto(conn.CreatedAt),
	}
}

// convertLaneToProto maps a domain Lane to the scripts proto Lane message.
func convertLaneToProto(lane *domain.Lane) *scriptspb.Lane {
	return &scriptspb.Lane{
		Id:        lane.ID.String(),
		ProjectId: lane.ProjectID.String(),
		Name:      lane.Name,
		Color:     lane.Color,
		Order:     lane.Order,
		CreatedAt: convertTimestampToProto(lane.CreatedAt),
		UpdatedAt: convertTimestampToProto(lane.UpdatedAt),
	}
}

// convertOutlineItemToProto maps a domain OutlineItem to the scripts proto OutlineItem message.
func convertOutlineItemToProto(item *domain.OutlineItem) *scriptspb.OutlineItem {
	return &scriptspb.OutlineItem{
		Id:               item.ID.String(),
		ProjectId:        item.ProjectID.String(),
		BeatId:           item.BeatID.String(),
		LaneId:           item.LaneID.String(),
		Order:            item.Order,
		TimelinePosition: item.TimelinePosition,
		Width:            item.Width,
		CreatedAt:        convertTimestampToProto(item.CreatedAt),
		UpdatedAt:        convertTimestampToProto(item.UpdatedAt),
	}
}

// convertBeatBoardToProto maps a domain BeatBoardData aggregate (beats, connections,
// lanes, and outline items) to the scripts proto BeatBoardData message.
func convertBeatBoardToProto(bb *domain.BeatBoardData) *scriptspb.BeatBoardData {
	protoBeats := make([]*scriptspb.Beat, len(bb.Beats))
	for i, beat := range bb.Beats {
		protoBeats[i] = convertBeatToProto(beat)
	}

	protoConns := make([]*scriptspb.Connection, len(bb.Connections))
	for i, conn := range bb.Connections {
		protoConns[i] = convertConnectionToProto(conn)
	}

	protoLanes := make([]*scriptspb.Lane, len(bb.Lanes))
	for i, lane := range bb.Lanes {
		protoLanes[i] = convertLaneToProto(lane)
	}

	protoItems := make([]*scriptspb.OutlineItem, len(bb.OutlineItems))
	for i, item := range bb.OutlineItems {
		protoItems[i] = convertOutlineItemToProto(item)
	}

	return &scriptspb.BeatBoardData{
		Beats:        protoBeats,
		Connections:  protoConns,
		Lanes:        protoLanes,
		OutlineItems: protoItems,
	}
}

// convertTimestampToProto converts a time.Time to the shared protobuf Timestamp type.
func convertTimestampToProto(t time.Time) *common.Timestamp {
	return &common.Timestamp{
		Seconds: t.Unix(),
		Nanos:   int32(t.Nanosecond()),
	}
}

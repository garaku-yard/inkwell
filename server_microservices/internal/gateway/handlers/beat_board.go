package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	scriptspb "scriptlith/server_microservices/pkg/grpc/scripts"
)

// CreateBeat handles POST /projects/{projectID}/beat-board/beats
func (h *ScriptsHandler) CreateBeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board/beats")

	var req struct {
		Title        string `json:"title"`
		Description  string `json:"description"`
		SceneNumbers string `json:"sceneNumbers"`
		Color        string `json:"color"`
		Position     *struct {
			X float64 `json:"x"`
			Y float64 `json:"y"`
		} `json:"position,omitempty"`
		PositionX *float64 `json:"positionX,omitempty"`
		PositionY *float64 `json:"positionY,omitempty"`
		Width     float64  `json:"width"`
		Height    float64  `json:"height"`
		ActNumber int32    `json:"actNumber"`
		Order     int32    `json:"order"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Handle both nested position object and flat positionX/Y
	var posX, posY float64
	if req.Position != nil {
		posX = req.Position.X
		posY = req.Position.Y
	} else {
		if req.PositionX != nil {
			posX = *req.PositionX
		}
		if req.PositionY != nil {
			posY = *req.PositionY
		}
	}

	resp, err := h.scriptsClient.CreateBeat(context.Background(), &scriptspb.CreateBeatRequest{
		ProjectId:    projectID,
		UserId:       userID,
		Title:        req.Title,
		Description:  req.Description,
		SceneNumbers: req.SceneNumbers,
		Color:        req.Color,
		PositionX:    posX,
		PositionY:    posY,
		Width:        req.Width,
		Height:       req.Height,
		ActNumber:    req.ActNumber,
		Order:        req.Order,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(transformBeat(resp.Beat))
}

// GetProjectBeatBoard handles GET /projects/{projectID}/beat-board
func (h *ScriptsHandler) GetProjectBeatBoard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board")

	resp, err := h.scriptsClient.GetProjectBeatBoard(context.Background(), &scriptspb.GetProjectBeatBoardRequest{
		ProjectId: projectID,
		UserId:    userID,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transformBeatBoardData(resp.BeatBoard))
}

// UpdateBeat handles PUT/PATCH /beats/{beatID}
func (h *ScriptsHandler) UpdateBeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	beatID := getIDFromPath(r.URL.Path, "/beats/")

	var req struct {
		Title        *string `json:"title,omitempty"`
		Description  *string `json:"description,omitempty"`
		SceneNumbers *string `json:"sceneNumbers,omitempty"`
		Color        *string `json:"color,omitempty"`
		Position     *struct {
			X float64 `json:"x"`
			Y float64 `json:"y"`
		} `json:"position,omitempty"`
		PositionX *float64 `json:"positionX,omitempty"`
		PositionY *float64 `json:"positionY,omitempty"`
		Width     *float64 `json:"width,omitempty"`
		Height    *float64 `json:"height,omitempty"`
		ActNumber *int32   `json:"actNumber,omitempty"`
		Order     *int32   `json:"order,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	grpcReq := &scriptspb.UpdateBeatRequest{
		BeatId: beatID,
		UserId: userID,
	}

	if req.Title != nil {
		grpcReq.Title = req.Title
	}
	if req.Description != nil {
		grpcReq.Description = req.Description
	}
	if req.SceneNumbers != nil {
		grpcReq.SceneNumbers = req.SceneNumbers
	}
	if req.Color != nil {
		grpcReq.Color = req.Color
	}
	// Handle both nested position object and flat positionX/Y
	if req.Position != nil {
		grpcReq.PositionX = &req.Position.X
		grpcReq.PositionY = &req.Position.Y
	} else {
		if req.PositionX != nil {
			grpcReq.PositionX = req.PositionX
		}
		if req.PositionY != nil {
			grpcReq.PositionY = req.PositionY
		}
	}
	if req.Width != nil {
		grpcReq.Width = req.Width
	}
	if req.Height != nil {
		grpcReq.Height = req.Height
	}
	if req.ActNumber != nil {
		grpcReq.ActNumber = req.ActNumber
	}
	if req.Order != nil {
		grpcReq.Order = req.Order
	}

	resp, err := h.scriptsClient.UpdateBeat(context.Background(), grpcReq)
	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transformBeat(resp.Beat))
}

// DeleteBeat handles DELETE /beats/{beatID}
func (h *ScriptsHandler) DeleteBeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	beatID := getIDFromPath(r.URL.Path, "/beats/")

	_, err := h.scriptsClient.DeleteBeat(context.Background(), &scriptspb.DeleteBeatRequest{
		BeatId: beatID,
		UserId: userID,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// CreateConnection handles POST /projects/{projectID}/beat-board/connections
func (h *ScriptsHandler) CreateConnection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board/connections")

	var req struct {
		FromBeatID string `json:"fromBeatId"`
		ToBeatID   string `json:"toBeatId"`
		FromSide   string `json:"fromSide"`
		ToSide     string `json:"toSide"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := h.scriptsClient.CreateConnection(context.Background(), &scriptspb.CreateConnectionRequest{
		ProjectId:  projectID,
		UserId:     userID,
		FromBeatId: req.FromBeatID,
		ToBeatId:   req.ToBeatID,
		FromSide:   req.FromSide,
		ToSide:     req.ToSide,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(transformConnection(resp.Connection))
}

// DeleteConnection handles DELETE /connections/{connectionID}
func (h *ScriptsHandler) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	connectionID := getIDFromPath(r.URL.Path, "/connections/")

	_, err := h.scriptsClient.DeleteConnection(context.Background(), &scriptspb.DeleteConnectionRequest{
		ConnectionId: connectionID,
		UserId:       userID,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// CreateLane handles POST /projects/{projectID}/beat-board/lanes
func (h *ScriptsHandler) CreateLane(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board/lanes")

	var req struct {
		Name  string `json:"name"`
		Color string `json:"color"`
		Order int32  `json:"order"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := h.scriptsClient.CreateLane(context.Background(), &scriptspb.CreateLaneRequest{
		ProjectId: projectID,
		UserId:    userID,
		Name:      req.Name,
		Color:     req.Color,
		Order:     req.Order,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(transformLane(resp.Lane))
}

// GetProjectLanes handles GET /projects/{projectID}/beat-board/lanes
func (h *ScriptsHandler) GetProjectLanes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board/lanes")

	resp, err := h.scriptsClient.GetProjectLanes(context.Background(), &scriptspb.GetProjectLanesRequest{
		ProjectId: projectID,
		UserId:    userID,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	lanes := make([]LaneResponse, 0, len(resp.Lanes))
	for _, lane := range resp.Lanes {
		if transformed := transformLane(lane); transformed != nil {
			lanes = append(lanes, *transformed)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(lanes)
}

// UpdateLane handles PUT /lanes/{laneID}
func (h *ScriptsHandler) UpdateLane(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	laneID := getIDFromPath(r.URL.Path, "/lanes/")

	var req struct {
		Name  *string `json:"name,omitempty"`
		Color *string `json:"color,omitempty"`
		Order *int32  `json:"order,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	grpcReq := &scriptspb.UpdateLaneRequest{
		LaneId: laneID,
		UserId: userID,
	}

	if req.Name != nil {
		grpcReq.Name = req.Name
	}
	if req.Color != nil {
		grpcReq.Color = req.Color
	}
	if req.Order != nil {
		grpcReq.Order = req.Order
	}

	resp, err := h.scriptsClient.UpdateLane(context.Background(), grpcReq)
	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transformLane(resp.Lane))
}

// UpdateLaneOrder handles PUT /projects/{projectID}/beat-board/lanes/order
func (h *ScriptsHandler) UpdateLaneOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board/lanes/order")

	var req struct {
		LaneIDs []string `json:"laneIds"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	_, err := h.scriptsClient.UpdateLaneOrder(context.Background(), &scriptspb.UpdateLaneOrderRequest{
		ProjectId: projectID,
		UserId:    userID,
		LaneIds:   req.LaneIDs,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DeleteLane handles DELETE /lanes/{laneID}
func (h *ScriptsHandler) DeleteLane(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	laneID := getIDFromPath(r.URL.Path, "/lanes/")

	_, err := h.scriptsClient.DeleteLane(context.Background(), &scriptspb.DeleteLaneRequest{
		LaneId: laneID,
		UserId: userID,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// CreateOutlineItem handles POST /projects/{projectID}/beat-board/outline-items
func (h *ScriptsHandler) CreateOutlineItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board/outline-items")

	var req struct {
		BeatID           string  `json:"beatId"`
		LaneID           string  `json:"laneId"`
		Order            int32   `json:"order"`
		TimelinePosition float64 `json:"timelinePosition"`
		Width            float64 `json:"width"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := h.scriptsClient.CreateOutlineItem(context.Background(), &scriptspb.CreateOutlineItemRequest{
		ProjectId:        projectID,
		UserId:           userID,
		BeatId:           req.BeatID,
		LaneId:           req.LaneID,
		Order:            req.Order,
		TimelinePosition: req.TimelinePosition,
		Width:            req.Width,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(transformOutlineItem(resp.OutlineItem))
}

// UpdateOutlineItem handles PUT /outline-items/{outlineItemID}
func (h *ScriptsHandler) UpdateOutlineItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	outlineItemID := getIDFromPath(r.URL.Path, "/outline-items/")

	var req struct {
		BeatID           *string  `json:"beatId,omitempty"`
		LaneID           *string  `json:"laneId,omitempty"`
		Order            *int32   `json:"order,omitempty"`
		TimelinePosition *float64 `json:"timelinePosition,omitempty"`
		Width            *float64 `json:"width,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	grpcReq := &scriptspb.UpdateOutlineItemRequest{
		OutlineItemId: outlineItemID,
		UserId:        userID,
	}

	if req.BeatID != nil {
		grpcReq.BeatId = req.BeatID
	}
	if req.LaneID != nil {
		grpcReq.LaneId = req.LaneID
	}
	if req.Order != nil {
		grpcReq.Order = req.Order
	}
	if req.TimelinePosition != nil {
		grpcReq.TimelinePosition = req.TimelinePosition
	}
	if req.Width != nil {
		grpcReq.Width = req.Width
	}

	resp, err := h.scriptsClient.UpdateOutlineItem(context.Background(), grpcReq)
	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transformOutlineItem(resp.OutlineItem))
}

// DeleteOutlineItem handles DELETE /outline-items/{outlineItemID}
func (h *ScriptsHandler) DeleteOutlineItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	outlineItemID := getIDFromPath(r.URL.Path, "/outline-items/")

	_, err := h.scriptsClient.DeleteOutlineItem(context.Background(), &scriptspb.DeleteOutlineItemRequest{
		OutlineItemId: outlineItemID,
		UserId:        userID,
	})

	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Helper function to extract project ID from path with specific pattern
func getProjectIDFromPath(path, prefix, suffix string) string {
	// Remove prefix
	rest := strings.TrimPrefix(path, prefix)
	// Find suffix position
	idx := strings.Index(rest, suffix)
	if idx == -1 {
		// If suffix not found, try extracting just the first segment
		// This handles both /projects/{id}/beats and /projects/{id}/beat-board/beats
		parts := strings.Split(rest, "/")
		if len(parts) > 0 && parts[0] != "" {
			return parts[0]
		}
		return ""
	}
	return rest[:idx]
}

// Helper function to extract ID from path
func getIDFromPath(path, prefix string) string {
	return strings.TrimPrefix(path, prefix)
}

// handleGRPCError converts gRPC errors to HTTP responses
func handleGRPCError(w http.ResponseWriter, err error) {
	http.Error(w, "Failed to process request: "+err.Error(), http.StatusInternalServerError)
}

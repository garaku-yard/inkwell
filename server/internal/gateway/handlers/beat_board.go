package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	scriptspb "inkwell/server/pkg/grpc/scripts"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// CreateBeat handles POST /projects/{projectID}/beat-board/beats
func (h *ScriptsHandler) CreateBeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board/beats")

	var req struct {
		Title        string `json:"title"`
		Description  string `json:"description"`
		SceneNumbers string `json:"sceneNumbers"` // DEPRECATED: Use startPage/endPage
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
		StartPage int32    `json:"startPage"`
		EndPage   int32    `json:"endPage"`
		ImageUrl  *string  `json:"imageUrl,omitempty"`
	}

	// Limit request body size to 50MB (base64 images can be large)
	r.Body = http.MaxBytesReader(w, r.Body, 50*1024*1024)

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("CreateBeat: Error decoding request body: %v", err)
		writeError(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("CreateBeat: Received request with imageUrl: %v", req.ImageUrl)

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

	resp, err := h.scriptsClient.CreateBeat(r.Context(), &scriptspb.CreateBeatRequest{
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
		StartPage:    req.StartPage,
		EndPage:      req.EndPage,
		ImageUrl:     req.ImageUrl,
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board")

	resp, err := h.scriptsClient.GetProjectBeatBoard(r.Context(), &scriptspb.GetProjectBeatBoardRequest{
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	beatID := getIDFromPath(r.URL.Path, "/beats/")

	var req struct {
		Title        *string `json:"title,omitempty"`
		Description  *string `json:"description,omitempty"`
		SceneNumbers *string `json:"sceneNumbers,omitempty"` // DEPRECATED: Use startPage/endPage
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
		StartPage *int32   `json:"startPage,omitempty"`
		EndPage   *int32   `json:"endPage,omitempty"`
		ImageUrl  *string  `json:"imageUrl,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
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
	if req.StartPage != nil {
		grpcReq.StartPage = req.StartPage
	}
	if req.EndPage != nil {
		grpcReq.EndPage = req.EndPage
	}
	if req.ImageUrl != nil {
		grpcReq.ImageUrl = req.ImageUrl
	}

	resp, err := h.scriptsClient.UpdateBeat(r.Context(), grpcReq)
	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transformBeat(resp.Beat))
}

// GetBeat handles GET /beats/{beatID}
func (h *ScriptsHandler) GetBeat(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	beatID := chi.URLParam(r, "beatId")

	resp, err := h.scriptsClient.GetBeat(r.Context(), &scriptspb.GetBeatRequest{
		BeatId: beatID,
		UserId: userID,
	})

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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	beatID := getIDFromPath(r.URL.Path, "/beats/")

	_, err := h.scriptsClient.DeleteBeat(r.Context(), &scriptspb.DeleteBeatRequest{
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
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
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := h.scriptsClient.CreateConnection(r.Context(), &scriptspb.CreateConnectionRequest{
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	connectionID := getIDFromPath(r.URL.Path, "/connections/")

	_, err := h.scriptsClient.DeleteConnection(r.Context(), &scriptspb.DeleteConnectionRequest{
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
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
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := h.scriptsClient.CreateLane(r.Context(), &scriptspb.CreateLaneRequest{
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board/lanes")

	resp, err := h.scriptsClient.GetProjectLanes(r.Context(), &scriptspb.GetProjectLanesRequest{
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
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
		writeError(w, "Invalid request body", http.StatusBadRequest)
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

	resp, err := h.scriptsClient.UpdateLane(r.Context(), grpcReq)
	if err != nil {
		handleGRPCError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transformLane(resp.Lane))
}

// UpdateLaneOrder handles PUT /projects/{projectID}/beat-board/lanes/order
func (h *ScriptsHandler) UpdateLaneOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	projectID := getProjectIDFromPath(r.URL.Path, "/projects/", "/beat-board/lanes/order")

	var req struct {
		LaneIDs    []string `json:"laneIds"`
		OrderedIDs []string `json:"orderedIds"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	laneIds := req.LaneIDs
	if len(laneIds) == 0 {
		laneIds = req.OrderedIDs
	}

	_, err := h.scriptsClient.UpdateLaneOrder(r.Context(), &scriptspb.UpdateLaneOrderRequest{
		ProjectId: projectID,
		UserId:    userID,
		LaneIds:   laneIds,
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	laneID := getIDFromPath(r.URL.Path, "/lanes/")

	_, err := h.scriptsClient.DeleteLane(r.Context(), &scriptspb.DeleteLaneRequest{
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
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
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := h.scriptsClient.CreateOutlineItem(r.Context(), &scriptspb.CreateOutlineItemRequest{
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
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
		writeError(w, "Invalid request body", http.StatusBadRequest)
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

	resp, err := h.scriptsClient.UpdateOutlineItem(r.Context(), grpcReq)
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)
	outlineItemID := getIDFromPath(r.URL.Path, "/outline-items/")

	_, err := h.scriptsClient.DeleteOutlineItem(r.Context(), &scriptspb.DeleteOutlineItemRequest{
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
	writeError(w, "Failed to process request: "+err.Error(), http.StatusInternalServerError)
}

// UploadBeatImage handles POST /beats/upload-image
func (h *ScriptsHandler) UploadBeatImage(w http.ResponseWriter, r *http.Request) {
	log.Printf("UploadBeatImage: Request received")

	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Limit request body size to 10MB
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	log.Printf("UploadBeatImage: Starting to parse form")
	// Parse the multipart form with 10MB max memory
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		log.Printf("UploadBeatImage: Error parsing form: %v", err)
		writeError(w, "Failed to parse form", http.StatusBadRequest)
		return
	}
	log.Printf("UploadBeatImage: Form parsed")

	file, header, err := r.FormFile("image")
	if err != nil {
		log.Printf("UploadBeatImage: Error getting file: %v", err)
		writeError(w, "No image provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	log.Printf("UploadBeatImage: Got file: %s, size: %d", header.Filename, header.Size)

	// Determine file extension from content type
	ext := ".jpg"
	contentType := header.Header.Get("Content-Type")
	if strings.Contains(contentType, "image/png") {
		ext = ".png"
	} else if strings.Contains(contentType, "image/gif") {
		ext = ".gif"
	} else if strings.Contains(contentType, "image/webp") {
		ext = ".webp"
	}

	// Create uploads directory if it doesn't exist
	uploadsDir := "./uploads/beats"
	log.Printf("UploadBeatImage: Creating directory: %s", uploadsDir)
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Printf("UploadBeatImage: Error creating uploads directory: %v", err)
		writeError(w, "Failed to save image", http.StatusInternalServerError)
		return
	}

	// Generate unique filename
	filename := fmt.Sprintf("%s-%d%s", uuid.New().String(), time.Now().Unix(), ext)
	filePath := filepath.Join(uploadsDir, filename)
	log.Printf("UploadBeatImage: Will save to: %s", filePath)

	// Create file on disk
	dst, err := os.Create(filePath)
	if err != nil {
		log.Printf("UploadBeatImage: Error creating file: %v", err)
		writeError(w, "Failed to save image", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Copy uploaded file to disk
	if _, err := dst.ReadFrom(file); err != nil {
		log.Printf("UploadBeatImage: Error copying file: %v", err)
		writeError(w, "Failed to save image", http.StatusInternalServerError)
		return
	}

	// Return relative path
	relativePath := fmt.Sprintf("/uploads/beats/%s", filename)
	log.Printf("UploadBeatImage: Saved image to %s", filePath)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"imageUrl": relativePath,
	})
}

package handler

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/l1roii/screenwriter/server/internal/entity"
	"github.com/l1roii/screenwriter/server/internal/middleware"
	"github.com/l1roii/screenwriter/server/internal/repository"
)

type LaneHandler struct {
	repo        repository.LaneRepository
	projectRepo repository.ProjectRepository
}

func NewLaneHandler(repo repository.LaneRepository, projectRepo repository.ProjectRepository) *LaneHandler {
	return &LaneHandler{repo: repo, projectRepo: projectRepo}
}

func (h *LaneHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok {
		http.Error(w, `{"error": "Not authorized"}`, http.StatusUnauthorized)
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	// Route: PATCH /lanes/{id} - For updating a lane's details (e.g., name)
	if len(pathParts) == 2 && pathParts[0] == "lanes" {
		if r.Method == http.MethodPatch {
			laneID := pathParts[1]
			h.handleUpdateLane(w, r, laneID, userID)
			return
		}
	}

	if len(pathParts) == 3 && pathParts[0] == "projects" && pathParts[2] == "lanes" && r.Method == http.MethodPost {
		projectID := pathParts[1]
		h.handleCreateLane(w, r, projectID, userID)
		return
	}

	// Route: PATCH /projects/{id}/lanes/order - For reordering all lanes in a project
	if len(pathParts) == 4 && pathParts[0] == "projects" && pathParts[2] == "lanes" && pathParts[3] == "order" {
		if r.Method == http.MethodPatch {
			projectID := pathParts[1]
			h.handleUpdateLaneOrder(w, r, projectID, userID)
			return
		}
	}

	http.NotFound(w, r)
}

// --- Handler Functions ---

// handleUpdateLane handles requests to change a lane's properties, like its name.
func (h *LaneHandler) handleUpdateLane(w http.ResponseWriter, r *http.Request, laneID, userID string) {
	// Security: First get the projectID associated with the lane
	projectID, err := h.repo.GetProjectIDForLane(laneID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error": "Lane not found"}`, http.StatusNotFound)
		} else {
			log.Printf("DB ERROR: Failed to get project for lane %s: %v", laneID, err)
			http.Error(w, `{"error": "Server error"}`, http.StatusInternalServerError)
		}
		return
	}

	if err := CheckOwnership(h.projectRepo, projectID, userID); err != nil {
		HandleError(w, err)
		return
	}

	var updates map[string]any
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := h.repo.UpdateLane(laneID, updates); err != nil {
		log.Printf("DB ERROR: Failed to update lane %s: %v", laneID, err)
		http.Error(w, `{"error": "Failed to update lane"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Lane updated successfully"})
}

func (h *LaneHandler) handleCreateLane(w http.ResponseWriter, r *http.Request, projectID, userID string) {
	// Security: Check if the user has access to this project
	if err := CheckOwnership(h.projectRepo, projectID, userID); err != nil {
		HandleError(w, err)
		return
	}

	var newLane entity.Lane
	if err := json.NewDecoder(r.Body).Decode(&newLane); err != nil {
		HandleError(w, &HttpError{Message: `{"error": "Invalid request body"}`, Code: http.StatusBadRequest})
		return
	}

	// Set the project ID from the URL path
	newLane.ProjectID = projectID

	createdLane, err := h.repo.CreateLane(&newLane)
	if err != nil {
		log.Printf("DB ERROR: Failed to create lane: %v", err)
		HandleError(w, &HttpError{Message: `{"error": "Failed to create lane"}`, Code: http.StatusInternalServerError})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createdLane)
}

// reorderLanesPayload defines the expected JSON structure for the reordering request.
type reorderLanesPayload struct {
	OrderedIDs []string `json:"orderedIds"`
}

// handleUpdateLaneOrder handles requests to save the new vertical order of lanes.
func (h *LaneHandler) handleUpdateLaneOrder(w http.ResponseWriter, r *http.Request, projectID, userID string) {
	// Security: Check if the user owns the project before performing the action
	if err := CheckOwnership(h.projectRepo, projectID, userID); err != nil {
		HandleError(w, err)
		return
	}

	var payload reorderLanesPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := h.repo.UpdateLaneOrder(projectID, payload.OrderedIDs); err != nil {
		log.Printf("DB ERROR: Failed to update lane order for project %s: %v", projectID, err)
		http.Error(w, `{"error": "Failed to update lane order"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Lane order updated successfully"})
}

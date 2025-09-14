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

type BeatHandler struct {
	repo        repository.BeatRepository
	projectRepo repository.ProjectRepository
}

func NewBeatHandler(repo repository.BeatRepository, projectRepo repository.ProjectRepository) *BeatHandler {
	return &BeatHandler{repo: repo, projectRepo: projectRepo}
}

func (h *BeatHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok {
		http.Error(w, `{"error": "Not authorized"}`, http.StatusUnauthorized)
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	if len(pathParts) == 3 && pathParts[2] == "beat-board" {
		if r.Method == http.MethodGet {
			projectID := pathParts[1]
			h.handleGetBeatBoard(w, r, projectID, userID)
			return
		}
	}

	if len(pathParts) == 3 && pathParts[2] == "beats" {
		if r.Method == http.MethodPost {
			projectID := pathParts[1]
			h.handleCreateBeat(w, r, projectID, userID)
			return
		}
	}

	if len(pathParts) == 2 && pathParts[0] == "beats" {
		beatID := pathParts[1]
		switch r.Method {
		case http.MethodPatch:
			h.handleUpdateBeat(w, r, beatID, userID)
		case http.MethodDelete:
			h.handleDeleteBeat(w, r, beatID, userID)
		}
		return
	}

	if len(pathParts) == 3 && pathParts[2] == "connections" {
		if r.Method == http.MethodPost {
			projectID := pathParts[1]
			h.handleCreateConnection(w, r, projectID, userID)
			return
		}
	}

	// Route: /connections/{id}
	if len(pathParts) == 2 && pathParts[0] == "connections" {
		if r.Method == http.MethodDelete {
			connID := pathParts[1]
			h.handleDeleteConnection(w, r, connID, userID)
		}
		return
	}

	http.NotFound(w, r)
}

// --- Handler Functions ---

func (h *BeatHandler) handleGetBeatBoard(w http.ResponseWriter, _ *http.Request, projectID, userID string) {
	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	data, err := h.repo.GetBeatBoard(projectID)
	if err != nil {
		log.Printf("DB ERROR: Failed to get beat board for project %s: %v", projectID, err)
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		return
	}

	// --- ADD THIS LOGGING BLOCK ---
	log.Printf("SUCCESS: Fetched %d beats and %d connections for project %s.", len(data.Beats), len(data.Connections), projectID)
	// This will confirm that the database query worked and we are about to send the JSON response.
	// --- END LOGGING BLOCK ---

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func (h *BeatHandler) handleCreateBeat(w http.ResponseWriter, r *http.Request, projectID, userID string) {
	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}
	var newBeat entity.Beat
	if err := json.NewDecoder(r.Body).Decode(&newBeat); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}
	newBeat.ProjectID = projectID

	createdBeat, err := h.repo.CreateBeat(&newBeat)
	if err != nil {
		log.Printf("DB ERROR: Failed to create beat: %v", err)
		http.Error(w, `{"error": "Failed to create beat"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createdBeat)
}

func (h *BeatHandler) handleUpdateBeat(w http.ResponseWriter, r *http.Request, beatID, userID string) {
	projectID, err := h.repo.GetProjectIDForBeat(beatID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error": "Beat not found"}`, http.StatusNotFound)
		} else {
			http.Error(w, `{"error": "Server error"}`, http.StatusInternalServerError)
		}
		return
	}
	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	var updates map[string]any
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if _, err := h.repo.UpdateBeat(beatID, updates); err != nil {
		log.Printf("DB ERROR: Failed to update beat %s: %v", beatID, err)
		http.Error(w, `{"error": "Failed to update beat"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Beat updated"})
}

func (h *BeatHandler) handleDeleteBeat(w http.ResponseWriter, _ *http.Request, beatID, userID string) {
	projectID, err := h.repo.GetProjectIDForBeat(beatID)
	if err != nil {
		if err == sql.ErrNoRows {
			// If beat doesn't exist, it's effectively deleted. Return success.
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"message": "Beat not found, considered deleted"})
			return
		}
		http.Error(w, `{"error": "Server error"}`, http.StatusInternalServerError)
		return
	}
	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	if err := h.repo.DeleteBeat(beatID); err != nil {
		log.Printf("DB ERROR: Failed to delete beat %s: %v", beatID, err)
		http.Error(w, `{"error": "Failed to delete beat"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Beat deleted"})
}

func (h *BeatHandler) handleCreateConnection(w http.ResponseWriter, r *http.Request, projectID, userID string) {
	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}
	var newConn entity.Connection
	if err := json.NewDecoder(r.Body).Decode(&newConn); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}
	newConn.ProjectID = projectID

	createdConn, err := h.repo.CreateConnection(&newConn)
	if err != nil {
		log.Printf("DB ERROR: Failed to create connection: %v", err)
		http.Error(w, `{"error": "Failed to create connection"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createdConn)
}

func (h *BeatHandler) handleDeleteConnection(w http.ResponseWriter, _ *http.Request, connID, userID string) {
	projectID, err := h.repo.GetProjectIDForConnection(connID)
	if err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"message": "Connection not found, considered deleted"})
			return
		}
		http.Error(w, `{"error": "Server error"}`, http.StatusInternalServerError)
		return
	}
	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	if err := h.repo.DeleteConnection(connID); err != nil {
		log.Printf("DB ERROR: Failed to delete connection %s: %v", connID, err)
		http.Error(w, `{"error": "Failed to delete connection"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Connection deleted"})
}

func (e *httpError) Error() string { return e.message }

func (h *BeatHandler) handleError(w http.ResponseWriter, err error) {
	if httpErr, ok := err.(*httpError); ok {
		http.Error(w, httpErr.message, httpErr.code)
	} else {
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
	}
}

func (h *BeatHandler) checkOwnership(projectID, userID string) error {
	project, err := h.projectRepo.GetByID(projectID)
	if err != nil {
		return &httpError{message: `{"error": "Server error"}`, code: http.StatusInternalServerError}
	}
	if project == nil {
		return &httpError{message: `{"error": "Project not found"}`, code: http.StatusNotFound}
	}
	if project.UserID != userID {
		// TODO: Check for collaborators
		return &httpError{message: `{"error": "Forbidden"}`, code: http.StatusForbidden}
	}
	return nil
}

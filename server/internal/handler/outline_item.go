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

type OutlineItemHandler struct {
	repo        repository.OutlineItemRepository
	projectRepo repository.ProjectRepository
}

func NewOutlineItemHandler(repo repository.OutlineItemRepository, projectRepo repository.ProjectRepository) *OutlineItemHandler {
	return &OutlineItemHandler{repo: repo, projectRepo: projectRepo}
}

func (h *OutlineItemHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok {
		http.Error(w, `{"error": "Not authorized"}`, http.StatusUnauthorized)
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	// Route: POST /outline-items
	if len(pathParts) == 1 && pathParts[0] == "outline-items" {
		if r.Method == http.MethodPost {
			h.handleCreateOutlineItem(w, r, userID)
			return
		}
	}

	// Route: PATCH or DELETE /outline-items/{id}
	if len(pathParts) == 2 && pathParts[0] == "outline-items" {
		itemID := pathParts[1]
		switch r.Method {
		case http.MethodPatch:
			h.handleUpdateOutlineItem(w, r, itemID, userID)
		case http.MethodDelete:
			h.handleDeleteOutlineItem(w, r, itemID, userID)
		}
		return
	}

	http.NotFound(w, r)
}

// --- Handler Functions ---

func (h *OutlineItemHandler) handleCreateOutlineItem(w http.ResponseWriter, r *http.Request, userID string) {
	var newItem entity.OutlineItem
	if err := json.NewDecoder(r.Body).Decode(&newItem); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Security: Check ownership of the project the item is being added to
	if err := h.checkOwnership(newItem.ProjectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	createdItem, err := h.repo.CreateOutlineItem(&newItem)
	if err != nil {
		log.Printf("DB ERROR: Failed to create outline item: %v", err)
		http.Error(w, `{"error": "Failed to create outline item"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createdItem)
}

func (h *OutlineItemHandler) handleUpdateOutlineItem(w http.ResponseWriter, r *http.Request, itemID, userID string) {
	projectID, err := h.repo.GetProjectIDForOutlineItem(itemID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error": "Outline item not found"}`, http.StatusNotFound)
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

	if err := h.repo.UpdateOutlineItem(itemID, updates); err != nil {
		log.Printf("DB ERROR: Failed to update outline item %s: %v", itemID, err)
		http.Error(w, `{"error": "Failed to update outline item"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Outline item updated"})
}

func (h *OutlineItemHandler) handleDeleteOutlineItem(w http.ResponseWriter, _ *http.Request, itemID, userID string) {
	projectID, err := h.repo.GetProjectIDForOutlineItem(itemID)
	if err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"message": "Item not found, considered deleted"})
			return
		}
		http.Error(w, `{"error": "Server error"}`, http.StatusInternalServerError)
		return
	}

	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	if err := h.repo.DeleteOutlineItem(itemID); err != nil {
		log.Printf("DB ERROR: Failed to delete outline item %s: %v", itemID, err)
		http.Error(w, `{"error": "Failed to delete item"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Outline item deleted"})
}

func (h *OutlineItemHandler) handleError(w http.ResponseWriter, err error) {
	if httpErr, ok := err.(*httpError); ok {
		http.Error(w, httpErr.message, httpErr.code)
	} else {
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
	}
}

func (h *OutlineItemHandler) checkOwnership(projectID, userID string) error {
	project, err := h.projectRepo.GetByID(projectID)
	if err != nil {
		if err == sql.ErrNoRows {
			return &httpError{message: `{"error": "Project not found"}`, code: http.StatusNotFound}
		}
		return &httpError{message: `{"error": "Server error"}`, code: http.StatusInternalServerError}
	}
	if project.UserID != userID {
		return &httpError{message: `{"error": "Forbidden"}`, code: http.StatusForbidden}
	}
	return nil
}

package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/l1roii/screenwriter/server/internal/entity"
	"github.com/l1roii/screenwriter/server/internal/middleware"
	"github.com/l1roii/screenwriter/server/internal/repository"
)

type ScreenplayHandler struct {
	repo        repository.ScreenplayRepository
	projectRepo repository.ProjectRepository
}

func NewScreenplayHandler(repo repository.ScreenplayRepository, projectRepo repository.ProjectRepository) *ScreenplayHandler {
	return &ScreenplayHandler{repo: repo, projectRepo: projectRepo}
}

func (h *ScreenplayHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok {
		http.Error(w, `{"error": "Not authorized"}`, http.StatusUnauthorized)
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	if len(pathParts) == 2 && pathParts[0] == "scenes" {
		if r.Method == http.MethodPatch {
			sceneID := pathParts[1]
			h.handleUpdateScene(w, r, sceneID, userID)
			return
		}
	}

	if len(pathParts) == 2 && pathParts[0] == "script-elements" {
		if r.Method == http.MethodPatch {
			elementID := pathParts[1]
			h.handleUpdateElement(w, r, elementID, userID)
			return
		}
	}

	if len(pathParts) == 3 && pathParts[0] == "scenes" && pathParts[2] == "elements" {
		if r.Method == http.MethodPost {
			sceneID := pathParts[1]
			h.handleCreateElement(w, r, sceneID, userID)
			return
		}
	}

	http.NotFound(w, r)
}

func (h *ScreenplayHandler) handleUpdateScene(w http.ResponseWriter, r *http.Request, sceneID, userID string) {
	projectID, err := h.repo.GetProjectIDForScene(sceneID)
	if err != nil || projectID == "" {
		http.Error(w, `{"error": "Scene not found or server error"}`, http.StatusNotFound)
		return
	}
	if err := h.checkOwnership(projectID, userID); err != nil {
		http.Error(w, `{"error": "Forbidden"}`, http.StatusForbidden)
		return
	}

	var payload struct {
		Setting string `json:"setting"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := h.repo.UpdateSceneSetting(sceneID, payload.Setting); err != nil {
		http.Error(w, `{"error": "Failed to update scene"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Scene updated"})
}

func (h *ScreenplayHandler) handleUpdateElement(w http.ResponseWriter, r *http.Request, elementID, userID string) {
	projectID, err := h.repo.GetProjectIDForElement(elementID)
	if err != nil {
		log.Printf("DB ERROR: Could not get project ID for element %s: %v", elementID, err)
		http.Error(w, `{"error": "Server error"}`, http.StatusInternalServerError)
		return
	}
	if projectID == "" {
		http.Error(w, `{"error": "Element not found"}`, http.StatusNotFound)
		return
	}

	var payload struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := h.repo.UpdateScriptElementContent(elementID, payload.Content); err != nil {
		http.Error(w, `{"error": "Failed to update element"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Element updated"})
}

func (h *ScreenplayHandler) handleCreateElement(w http.ResponseWriter, r *http.Request, sceneID, userID string) {
	projectID, err := h.repo.GetProjectIDForScene(sceneID)
	if err != nil {
		log.Printf("DB ERROR: Could not get project ID for scene %s: %v", sceneID, err) // ADDED LOGGING
		http.Error(w, `{"error": "Server error"}`, http.StatusInternalServerError)
		return
	}
	if projectID == "" {
		http.Error(w, `{"error": "Scene not found"}`, http.StatusNotFound)
		return
	}
	if err := h.checkOwnership(projectID, userID); err != nil {
		http.Error(w, `{"error": "Forbidden"}`, http.StatusForbidden)
		return
	}

	var newElement entity.ScriptElement
	if err := json.NewDecoder(r.Body).Decode(&newElement); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}
	newElement.SceneID = sceneID

	createdElement, err := h.repo.CreateElement(&newElement)
	if err != nil {
		log.Printf("DB ERROR: Failed to create element: %v", err) // ADDED LOGGING
		http.Error(w, `{"error": "Failed to create element"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createdElement)
}

func (h *ScreenplayHandler) checkOwnership(projectID, userID string) error {
	project, err := h.projectRepo.GetByID(projectID)
	if err != nil || project == nil {
		return err
	}
	if project.UserID != userID {
		return http.ErrHijacked
	}
	return nil
}

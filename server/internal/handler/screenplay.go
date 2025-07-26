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

	// Route: /scenes/{sceneId}/elements
	if len(pathParts) == 3 && pathParts[0] == "scenes" && pathParts[2] == "elements" {
		if r.Method == http.MethodPost {
			sceneID := pathParts[1]
			h.handleCreateElement(w, r, sceneID, userID)
			return
		}
	}

	// Route: /acts/{actId}/scenes
	if len(pathParts) == 3 && pathParts[0] == "acts" && pathParts[2] == "scenes" {
		if r.Method == http.MethodPost {
			actID := pathParts[1]
			h.handleCreateScene(w, r, actID, userID)
			return
		}
	}

	// Routes for a specific resource: /scenes/{id} or /script-elements/{id}
	if len(pathParts) == 2 {
		resourceType := pathParts[0]
		resourceID := pathParts[1]

		switch resourceType {
		case "scenes":
			switch r.Method {
			case http.MethodPatch:
				h.handleUpdateScene(w, r, resourceID, userID)
				return
			case http.MethodDelete:
				h.handleDeleteScene(w, r, resourceID, userID)
				return
			}
		case "script-elements":
			switch r.Method {
			case http.MethodPatch:
				h.handleUpdateElement(w, r, resourceID, userID)
				return
			case http.MethodDelete:
				h.handleDeleteElement(w, r, resourceID, userID)
				return
			}
		}
	}

	http.NotFound(w, r)
}

// --- Handler Functions ---

func (h *ScreenplayHandler) handleUpdateScene(w http.ResponseWriter, r *http.Request, sceneID, userID string) {
	projectID, err := h.repo.GetProjectIDForScene(sceneID)
	if err := h.checkOwnership(projectID, userID, err); err != nil {
		h.handleError(w, err)
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
	if err := h.checkOwnership(projectID, userID, err); err != nil {
		h.handleError(w, err)
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
	if err := h.checkOwnership(projectID, userID, err); err != nil {
		h.handleError(w, err)
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
		log.Printf("DB ERROR: Failed to create element: %v", err)
		http.Error(w, `{"error": "Failed to create element"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createdElement)
}

func (h *ScreenplayHandler) handleDeleteElement(w http.ResponseWriter, r *http.Request, elementID, userID string) {
	projectID, err := h.repo.GetProjectIDForElement(elementID)
	if err := h.checkOwnership(projectID, userID, err); err != nil {
		h.handleError(w, err)
		return
	}

	if err := h.repo.DeleteElement(elementID); err != nil {
		log.Printf("HANDLER ERROR: Call to repo.DeleteElement failed for element %s: %v", elementID, err)
		http.Error(w, `{"error": "Failed to delete element"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Element deleted successfully"})
}

func (h *ScreenplayHandler) handleCreateScene(w http.ResponseWriter, r *http.Request, actID, userID string) {
	projectID, err := h.repo.GetProjectIDForAct(actID)
	if err := h.checkOwnership(projectID, userID, err); err != nil {
		h.handleError(w, err)
		return
	}

	var payload struct {
		Setting string `json:"setting"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	createdScene, err := h.repo.CreateScene(actID, payload.Setting)
	if err != nil {
		log.Printf("DB ERROR: Failed to create scene: %v", err)
		http.Error(w, `{"error": "Failed to create scene"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createdScene)
}

func (h *ScreenplayHandler) handleDeleteScene(w http.ResponseWriter, r *http.Request, sceneID, userID string) {
	projectID, err := h.repo.GetProjectIDForScene(sceneID)
	if err := h.checkOwnership(projectID, userID, err); err != nil {
		h.handleError(w, err)
		return
	}

	if err := h.repo.DeleteScene(sceneID); err != nil {
		log.Printf("DB ERROR: Failed to delete scene %s: %v", sceneID, err)
		http.Error(w, `{"error": "Failed to delete scene"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Scene deleted successfully"})
}

func (h *ScreenplayHandler) handleError(w http.ResponseWriter, err error) {
	if httpErr, ok := err.(*httpError); ok {
		http.Error(w, httpErr.message, httpErr.code)
	} else {
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
	}
}

func (h *ScreenplayHandler) checkOwnership(projectID, userID string, errFromRepo error) error {
	if errFromRepo != nil {
		log.Printf("DB ERROR in ownership check pre-flight: %v", errFromRepo)
		return &httpError{message: `{"error": "Server error"}`, code: http.StatusInternalServerError}
	}
	if projectID == "" {
		return &httpError{message: `{"error": "Resource not found"}`, code: http.StatusNotFound}
	}

	project, err := h.projectRepo.GetByID(projectID)
	if err != nil {
		log.Printf("DB ERROR in checkOwnership for project %s: %v", projectID, err)
		return &httpError{message: `{"error": "Server error while verifying ownership"}`, code: http.StatusInternalServerError}
	}
	if project == nil {
		return &httpError{message: `{"error": "Project not found for resource"}`, code: http.StatusNotFound}
	}
	if project.UserID != userID {
		// A more advanced check could look for collaborators here
		return &httpError{message: `{"error": "Forbidden"}`, code: http.StatusForbidden}
	}
	return nil
}

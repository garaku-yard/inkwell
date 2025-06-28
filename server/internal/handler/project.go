package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/l1roii/screenwriter/server/internal/entity"
	"github.com/l1roii/screenwriter/server/internal/middleware"
	"github.com/l1roii/screenwriter/server/internal/repository"
)

type ProjectHandler struct {
	repo repository.ProjectRepository
}

func NewProjectHandler(repo repository.ProjectRepository) *ProjectHandler {
	return &ProjectHandler{repo: repo}
}

// ServeHTTP acts as a RESTful router for the /projects/ path.
func (h *ProjectHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok {
		http.Error(w, `{"error": "Not authorized"}`, http.StatusUnauthorized)
		return
	}

	// UPDATED: More robust path trimming. This will correctly extract the ID.
	idStr := strings.TrimPrefix(r.URL.Path, "/projects/")

	// If idStr is empty, the path was exactly "/projects/" or "/projects"
	if idStr == "" || r.URL.Path == "/projects" {
		switch r.Method {
		case http.MethodGet:
			h.handleListProjects(w, r, userID)
		case http.MethodPost:
			h.handleCreateProject(w, r, userID)
		default:
			http.Error(w, `{"error": "Method not allowed on /projects collection"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// If we are here, it means we have an ID in the path.
	projectID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, `{"error": "Invalid project ID in URL"}`, http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodPut:
		h.handleUpdateProject(w, r, projectID, userID)
	case http.MethodDelete:
		h.handleDeleteProject(w, r, projectID, userID)
	case http.MethodPatch:
		h.handleStarProject(w, r, projectID, userID)
	default:
		http.Error(w, `{"error": "Method not allowed on specific project"}`, http.StatusMethodNotAllowed)
	}
}

// --- (The rest of your handler functions: handleListProjects, handleCreateProject, etc., do not need to be changed) ---
// ... handler functions from previous steps ...

// handleListProjects handles GET requests to list all projects for a given user.
func (h *ProjectHandler) handleListProjects(w http.ResponseWriter, _ *http.Request, userID int64) {
	projects, err := h.repo.ListByUserID(userID)
	if err != nil {
		log.Printf("ERROR: Failed to list projects for user %d: %v", userID, err)
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		return
	}
	if projects == nil {
		projects = []*entity.Project{}
	}
	json.NewEncoder(w).Encode(projects)
}

// handleCreateProject handles POST requests to create a new project.
func (h *ProjectHandler) handleCreateProject(w http.ResponseWriter, r *http.Request, userID int64) {
	var reqBody struct {
		ProjectName string `json:"projectName"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	project := &entity.Project{
		UserID:      userID,
		ProjectName: reqBody.ProjectName,
		Description: reqBody.Description,
	}

	if err := h.repo.Create(project); err != nil {
		log.Printf("ERROR: Failed to create project for user %d: %v", userID, err)
		http.Error(w, `{"error": "Could not create project"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(project)
}

// handleUpdateProject handles PUT requests to update a project.
func (h *ProjectHandler) handleUpdateProject(w http.ResponseWriter, r *http.Request, projectID, userID int64) {
	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	var reqBody struct {
		ProjectName string `json:"projectName"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	projectToUpdate := &entity.Project{
		ID:          projectID,
		UserID:      userID,
		ProjectName: reqBody.ProjectName,
		Description: reqBody.Description,
	}

	updatedProject, err := h.repo.Update(projectToUpdate)
	if err != nil {
		log.Printf("ERROR: Failed to update project %d: %v", projectID, err)
		http.Error(w, `{"error": "Could not update project"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(updatedProject)
}

// handleDeleteProject handles DELETE requests for a project.
func (h *ProjectHandler) handleDeleteProject(w http.ResponseWriter, _ *http.Request, projectID, userID int64) {
	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	if err := h.repo.Delete(projectID, userID); err != nil {
		log.Printf("ERROR: Failed to delete project %d: %v", projectID, err)
		http.Error(w, `{"error": "Could not delete project"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleStarProject handles PATCH requests to star/unstar a project.
func (h *ProjectHandler) handleStarProject(w http.ResponseWriter, r *http.Request, projectID, userID int64) {
	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	var reqBody struct {
		IsStarred bool `json:"isStarred"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	updatedProject, err := h.repo.UpdateIsStarred(projectID, userID, reqBody.IsStarred)
	if err != nil {
		log.Printf("ERROR: Failed to star project %d: %v", projectID, err)
		http.Error(w, `{"error": "Could not update star status"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(updatedProject)
}

// handleError is a small helper to reduce code duplication in error handling.
func (h *ProjectHandler) handleError(w http.ResponseWriter, err error) {
	if httpErr, ok := err.(*httpError); ok {
		http.Error(w, httpErr.message, httpErr.code)
	} else {
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
	}
}

// checkOwnership is a helper method to ensure a user can only modify their own projects.
func (h *ProjectHandler) checkOwnership(projectID, userID int64) error {
	project, err := h.repo.GetByID(projectID)
	if err != nil {
		log.Printf("DB ERROR in checkOwnership for project %d: %v", projectID, err)
		return &httpError{message: `{"error": "Server error while verifying ownership"}`, code: http.StatusInternalServerError}
	}
	if project == nil {
		return &httpError{message: `{"error": "Project not found"}`, code: http.StatusNotFound}
	}
	if project.UserID != userID {
		return &httpError{message: `{"error": "Forbidden"}`, code: http.StatusForbidden}
	}
	return nil
}

// httpError is a helper struct for custom errors.
type httpError struct {
	message string
	code    int
}

func (e *httpError) Error() string {
	return e.message
}

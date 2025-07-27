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

type ProjectHandler struct {
	repo       repository.ProjectRepository
	userRepo   repository.UserRepository
	collabRepo repository.CollaboratorRepository
}

func NewProjectHandler(repo repository.ProjectRepository, userRepo repository.UserRepository, collabRepo repository.CollaboratorRepository) *ProjectHandler {
	return &ProjectHandler{
		repo:       repo,
		userRepo:   userRepo,
		collabRepo: collabRepo,
	}
}

func (h *ProjectHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok {
		http.Error(w, `{"error": "Not authorized"}`, http.StatusUnauthorized)
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	if len(pathParts) > 0 && pathParts[0] == "projects" {
		// Handle routes like /projects/{id}/collaborators
		if len(pathParts) == 3 && pathParts[2] == "collaborators" {
			projectID := pathParts[1]
			if r.Method == http.MethodPost {
				h.handleAddCollaborator(w, r, projectID, userID)
				return
			}
		}

		// Handle routes for the main projects collection: /projects
		if len(pathParts) == 1 {
			switch r.Method {
			case http.MethodGet:
				h.handleListProjects(w, userID)
			case http.MethodPost:
				h.handleCreateProject(w, r, userID)
			default:
				http.Error(w, `{"error": "Method not allowed on /projects collection"}`, http.StatusMethodNotAllowed)
			}
			return
		}

		// Handle routes for a specific project: /projects/{id}
		if len(pathParts) == 2 {
			projectID := pathParts[1]
			switch r.Method {
			case http.MethodGet:
				h.handleGetFullProject(w, r, projectID, userID)
			case http.MethodPut:
				h.handleUpdateProject(w, r, projectID, userID)
			case http.MethodDelete:
				h.handleDeleteProject(w, r, projectID, userID)
			case http.MethodPatch:
				h.handleStarProject(w, r, projectID, userID)
			default:
				http.Error(w, `{"error": "Method not allowed on this specific project"}`, http.StatusMethodNotAllowed)
			}
			return
		}
	}

	// If no route matches, return a 404
	http.NotFound(w, r)
}

// --- Handler Functions ---

func (h *ProjectHandler) handleGetFullProject(w http.ResponseWriter, _ *http.Request, projectID, userID string) {
	project, err := h.repo.GetFullProjectByIDForUser(projectID, userID)
	if err != nil {
		log.Printf("ERROR: Failed to get full project %s: %v", projectID, err)
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		return
	}
	if project == nil {
		http.Error(w, `{"error": "Project not found or access denied"}`, http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(project)
}

func (h *ProjectHandler) handleListProjects(w http.ResponseWriter, userID string) {
	projects, err := h.repo.ListByUserID(userID)
	if err != nil {
		log.Printf("ERROR: Failed to list projects for user %s: %v", userID, err)
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		return
	}
	if projects == nil {
		projects = []*entity.Project{}
	}
	json.NewEncoder(w).Encode(projects)
}

func (h *ProjectHandler) handleCreateProject(w http.ResponseWriter, r *http.Request, userID string) {
	var reqBody struct {
		ProjectName string `json:"projectName"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	// --- NEW VALIDATION STEP ---
	// Trim whitespace and check if the project name is empty.
	if strings.TrimSpace(reqBody.ProjectName) == "" {
		http.Error(w, `{"error": "Project name cannot be empty"}`, http.StatusBadRequest)
		return
	}
	// --- END VALIDATION ---

	project := &entity.Project{
		UserID:      userID,
		ProjectName: reqBody.ProjectName,
		Description: reqBody.Description,
	}

	if err := h.repo.Create(project); err != nil {
		log.Printf("ERROR: Failed to create project for user %s: %v", userID, err)
		http.Error(w, `{"error": "Could not create project"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(project)
}

func (h *ProjectHandler) handleUpdateProject(w http.ResponseWriter, r *http.Request, projectID, userID string) {
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
		log.Printf("ERROR: Failed to update project %s: %v", projectID, err)
		http.Error(w, `{"error": "Could not update project"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(updatedProject)
}

func (h *ProjectHandler) handleDeleteProject(w http.ResponseWriter, _ *http.Request, projectID, userID string) {
	if err := h.checkOwnership(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	if err := h.repo.Delete(projectID, userID); err != nil {
		log.Printf("ERROR: Failed to delete project %s: %v", projectID, err)
		http.Error(w, `{"error": "Could not delete project"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ProjectHandler) handleStarProject(w http.ResponseWriter, r *http.Request, projectID, userID string) {
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
		log.Printf("ERROR: Failed to star project %s: %v", projectID, err)
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
func (h *ProjectHandler) checkOwnership(projectID, userID string) error {
	project, err := h.repo.GetByID(projectID)
	if err != nil {
		log.Printf("DB ERROR in checkOwnership for project %s: %v", projectID, err)
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

func (h *ProjectHandler) handleAddCollaborator(w http.ResponseWriter, r *http.Request, projectID, ownerUserID string) {
	// First, check if the person making the request owns the project.
	if err := h.checkOwnership(projectID, ownerUserID); err != nil {
		h.handleError(w, err)
		return
	}

	var reqBody struct {
		UsernameWithTag string `json:"usernameWithTag"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Parse the username#tag string
	parts := strings.Split(reqBody.UsernameWithTag, "#")
	if len(parts) != 2 {
		http.Error(w, `{"error": "Invalid username format. Expected 'username#tag'"}`, http.StatusBadRequest)
		return
	}
	username, tag := parts[0], parts[1]

	// Find the user to be added
	userToAdd, err := h.userRepo.GetByUsernameAndTag(username, tag)
	if err != nil {
		log.Printf("DB ERROR: Could not find collaborator %s#%s: %v", username, tag, err)
		http.Error(w, `{"error": "Could not find user"}`, http.StatusInternalServerError)
		return
	}
	if userToAdd == nil {
		http.Error(w, `{"error": "User not found"}`, http.StatusNotFound)
		return
	}

	// Add the user to the project
	if err := h.collabRepo.Add(projectID, userToAdd.ID); err != nil {
		log.Printf("DB ERROR: Could not add collaborator %s to project %s: %v", userToAdd.ID, projectID, err)
		http.Error(w, `{"error": "Failed to add collaborator"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "Collaborator added successfully"})
}

// httpError is a helper struct for custom errors.
type httpError struct {
	message string
	code    int
}

// func (e *httpError) Error() string {
// 	return e.message
// }

package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	// This import path MUST match the module path in your go.mod file.
	"github.com/l1roii/screenwriter/server/internal/entity"
	"github.com/l1roii/screenwriter/server/internal/repository"
)

type ProjectHandler struct {
	// The handler depends on the repository interface, not the concrete implementation.
	repo repository.ProjectRepository
}

func NewProjectHandler(repo repository.ProjectRepository) *ProjectHandler {
	return &ProjectHandler{repo: repo}
}

// ServeHTTP acts as a sub-router for /projects path.
// It checks the request method and query parameters to decide which action to take.
func (h *ProjectHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// If there's an 'id' or 'name' query parameter, assume we are getting a single project.
	if r.URL.Query().Get("id") != "" || r.URL.Query().Get("name") != "" {
		h.getProject(w, r)
		return
	}

	// Otherwise, list all projects for a user.
	h.listProjects(w, r)
}

// listProjects handles requests to list all projects for a given user.
// Example: GET /projects?userId=1
func (h *ProjectHandler) listProjects(w http.ResponseWriter, r *http.Request) {
	// In a real application, you would get the user ID from an authentication
	// token (JWT) instead of a query parameter for security.
	userIDStr := r.URL.Query().Get("userId")
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid or missing userId parameter", http.StatusBadRequest)
		return
	}

	projects, err := h.repo.ListByUserID(userID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// To prevent returning 'null' for an empty list, which can be problematic
	// for some frontend clients, we explicitly return an empty JSON array `[]`.
	if projects == nil {
		projects = []*entity.Project{}
	}

	json.NewEncoder(w).Encode(projects)
}

// getProject handles requests to get a single project by its ID or name.
// Example: GET /projects?id=123
// Example: GET /projects?name=MyFirstScript&userId=1
func (h *ProjectHandler) getProject(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	name := r.URL.Query().Get("name")

	var project *entity.Project
	var err error

	if idStr != "" {
		// Find by ID
		var projectID int64
		projectID, err = strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid id parameter", http.StatusBadRequest)
			return
		}
		project, err = h.repo.GetByID(projectID)
	} else if name != "" {
		// Find by Name requires a userID
		userIDStr := r.URL.Query().Get("userId")
		var userID int64
		userID, err = strconv.ParseInt(userIDStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid or missing userId parameter when searching by name", http.StatusBadRequest)
			return
		}
		project, err = h.repo.GetByName(userID, name)
	}

	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if project == nil {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(project)
}

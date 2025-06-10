package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/l1roii/screenwriter/server/internal/entity"
	"github.com/l1roii/screenwriter/server/internal/repository"
)

// ProjectHandler is responsible for handling all HTTP requests related to projects.
// It embeds a ProjectRepository interface to interact with the data layer.
type ProjectHandler struct {
	// repo is the repository that provides access to the project data storage.
	// By depending on the interface, this handler is decoupled from the specific
	// database implementation, making it easier to test.
	repo repository.ProjectRepository
}

// NewProjectHandler creates and returns a new ProjectHandler instance.
// It requires a ProjectRepository to be passed as a dependency.
func NewProjectHandler(repo repository.ProjectRepository) *ProjectHandler {
	return &ProjectHandler{repo: repo}
}

/*
ServeHTTP acts as the main entry point and router for the /projects endpoint.

It implements the http.Handler interface. Based on the HTTP method and query
parameters of the request, it delegates the work to more specific internal
methods like handleListProjects or handleGetProject. It also sets the
Content-Type header for all responses to application/json.
*/
func (h *ProjectHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// This handler uses query parameters for routing.
	// If an 'id' or 'name' is present, it's a request for a single project.
	// Otherwise, it's a request to list projects.
	// For more complex routing, a dedicated router library would be used.
	if r.URL.Query().Get("id") != "" || r.URL.Query().Get("name") != "" {
		h.handleGetProject(w, r)
		return
	}

	h.handleListProjects(w, r)
}

/*
handleListProjects handles GET requests to list all projects for a given user.

It expects a 'userId' query parameter to identify which user's projects to fetch.
For security in a real application, this ID should come from a validated
authentication token (e.g., JWT) rather than a query parameter.

On success, it returns a 200 OK status with a JSON array of projects.
If no projects are found, it returns an empty JSON array `[]`.
*/
func (h *ProjectHandler) handleListProjects(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("userid")
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		http.Error(w, `{"error": "Invalid or missing 'userId' query parameter"}`, http.StatusBadRequest)
		return
	}

	projects, err := h.repo.ListByUserID(userID)
	if err != nil {
		log.Printf("ERROR: Failed to list projects for user %d: %v", userID, err)
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		return
	}

	// To prevent returning 'null' for an empty list, which can be problematic
	// for some frontend clients, we explicitly initialize an empty slice if needed.
	if projects == nil {
		projects = []*entity.Project{}
	}

	json.NewEncoder(w).Encode(projects)
}

/*
handleGetProject handles GET requests to fetch a single project by its ID or by its name.

It routes based on which query parameter is provided:
  - `id`: Fetches the project with the matching primary key. (e.g., GET /projects?id=123)
  - `name`: Fetches a project by its name, but also requires a `userId` to ensure the correct project is returned. (e.g., GET /projects?name=MyScript&userId=1)

On success, it returns a 200 OK status with a JSON object for the project.
If the project is not found, it returns a 404 Not Found error.
*/
func (h *ProjectHandler) handleGetProject(w http.ResponseWriter, r *http.Request) {
	// idStr := r.URL.Query().Get("id")
	name := r.URL.Query().Get("name")

	var project *entity.Project
	var err error

	if name != "" {
		// Logic to find project by its name, scoped to a specific user.
		userIDStr := r.URL.Query().Get("userId")
		var userID int64
		userID, err = strconv.ParseInt(userIDStr, 10, 64)
		if err != nil {
			http.Error(w, `{"error": "Invalid or missing 'userId' parameter when searching by name"}`, http.StatusBadRequest)
			return
		}
		project, err = h.repo.GetByName(userID, name)
	}

	if err != nil {
		log.Printf("ERROR: Failed to get project: %v", err)
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		return
	}

	// If the repository returns nil, nil, it means the project was not found.
	if project == nil {
		http.Error(w, `{"error": "Project not found"}`, http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(project)
}

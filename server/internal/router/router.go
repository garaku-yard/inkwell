package router

import (
	"net/http"

	"github.com/l1roii/screenwriter/server/internal/handler"
	"github.com/l1roii/screenwriter/server/internal/middleware"
)

// NewRouter creates and configures a new application router.
// It takes the necessary handlers as dependencies and sets up all the API endpoints.
func NewRouter(authHandler *handler.AuthHandler, projectHandler *handler.ProjectHandler) *http.ServeMux {
	mux := http.NewServeMux()

	// Auth routes are public and do not need the auth middleware.
	mux.HandleFunc("/register", authHandler.Register)
	mux.HandleFunc("/login", authHandler.Login)

	// Project routes are protected. Any request to /projects will first go
	// through the AuthMiddleware to check for a valid JWT.
	protectedProjectsHandler := middleware.AuthMiddleware(projectHandler)
	mux.Handle("/projects", protectedProjectsHandler)

	return mux
}

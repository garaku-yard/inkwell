package router

import (
	"net/http"

	"github.com/l1roii/screenwriter/server/internal/handler"
	"github.com/l1roii/screenwriter/server/internal/middleware"
)

// NewRouter creates and configures a new application router.
func NewRouter(authHandler *handler.AuthHandler, projectHandler *handler.ProjectHandler) *http.ServeMux {
	mux := http.NewServeMux()

	// Auth routes are public.
	mux.HandleFunc("/register", authHandler.Register)
	mux.HandleFunc("/login", authHandler.Login)

	// UPDATED: By adding a trailing slash to "/projects/", we tell the router
	// to send all requests that start with this prefix (e.g., /projects/1, /projects/2/scenes)
	// to the projectHandler. This is the key fix.
	protectedProjectsHandler := middleware.AuthMiddleware(projectHandler)
	mux.Handle("/projects/", protectedProjectsHandler)

	return mux
}

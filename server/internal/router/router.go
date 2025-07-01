package router

import (
	"net/http"

	"github.com/l1roii/screenwriter/server/internal/handler"
	"github.com/l1roii/screenwriter/server/internal/middleware"
)

func NewRouter(authHandler *handler.AuthHandler, projectHandler *handler.ProjectHandler) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/register", authHandler.Register)
	mux.HandleFunc("/login", authHandler.Login)

	protectedProjectsHandler := middleware.AuthMiddleware(projectHandler)
	mux.Handle("/projects/", protectedProjectsHandler)

	return mux
}

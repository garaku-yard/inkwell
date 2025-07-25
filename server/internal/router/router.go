package router

import (
	"net/http"

	"github.com/l1roii/screenwriter/server/internal/handler"
	"github.com/l1roii/screenwriter/server/internal/middleware"
)

func NewRouter(
	authHandler *handler.AuthHandler,
	projectHandler *handler.ProjectHandler,
	screenplayHandler *handler.ScreenplayHandler, // NEW
) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/register", authHandler.Register)
	mux.HandleFunc("/login", authHandler.Login)

	protectedProjectsHandler := middleware.AuthMiddleware(projectHandler)
	mux.Handle("/projects/", protectedProjectsHandler)

	protectedScreenplayHandler := middleware.AuthMiddleware(screenplayHandler)

	mux.Handle("/scenes/", protectedScreenplayHandler)
	mux.Handle("/script-elements/", protectedScreenplayHandler)

	return mux
}

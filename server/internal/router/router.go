package router

import (
	"net/http"
	"strings"

	"github.com/l1roii/screenwriter/server/internal/handler"
	"github.com/l1roii/screenwriter/server/internal/middleware"
)

func NewRouter(
	authHandler *handler.AuthHandler,
	projectHandler *handler.ProjectHandler,
	screenplayHandler *handler.ScreenplayHandler,
	beatHandler *handler.BeatHandler,
) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/register", authHandler.Register)
	mux.HandleFunc("/login", authHandler.Login)

	// --- Individual Resource Handlers ---
	// These handlers manage top-level routes like /acts/{id}, /beats/{id}, etc.
	mux.Handle("/acts/", middleware.AuthMiddleware(screenplayHandler))
	mux.Handle("/scenes/", middleware.AuthMiddleware(screenplayHandler))
	mux.Handle("/script-elements/", middleware.AuthMiddleware(screenplayHandler))
	mux.Handle("/beats/", middleware.AuthMiddleware(beatHandler))
	mux.Handle("/connections/", middleware.AuthMiddleware(beatHandler))

	mux.Handle("/projects/", middleware.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

		if len(pathParts) == 3 && (pathParts[2] == "beat-board" || pathParts[2] == "beats" || pathParts[2] == "connections") {
			beatHandler.ServeHTTP(w, r)
			return
		}

		projectHandler.ServeHTTP(w, r)
	})))

	return mux
}

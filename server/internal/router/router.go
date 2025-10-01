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
	collaboratorHandler *handler.CollaboratorHandler,
	laneHandler *handler.LaneHandler,
	outlineItemHandler *handler.OutlineItemHandler,
	aiHandler *handler.AIHandler,
) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/register", authHandler.Register)
	mux.HandleFunc("/login", authHandler.Login)

	mux.Handle("/api/ai/chat", middleware.AuthMiddleware(http.HandlerFunc(aiHandler.Chat)))
	mux.Handle("/api/ai/models", middleware.AuthMiddleware(http.HandlerFunc(aiHandler.GetModels)))

	mux.Handle("/acts", middleware.AuthMiddleware(screenplayHandler))
	mux.Handle("/acts/", middleware.AuthMiddleware(screenplayHandler))
	mux.Handle("/scenes", middleware.AuthMiddleware(screenplayHandler))
	mux.Handle("/scenes/", middleware.AuthMiddleware(screenplayHandler))
	mux.Handle("/script-elements", middleware.AuthMiddleware(screenplayHandler))
	mux.Handle("/script-elements/", middleware.AuthMiddleware(screenplayHandler))
	mux.Handle("/comments", middleware.AuthMiddleware(screenplayHandler))
	mux.Handle("/comments/", middleware.AuthMiddleware(screenplayHandler))

	mux.Handle("/beats", middleware.AuthMiddleware(beatHandler))
	mux.Handle("/beats/", middleware.AuthMiddleware(beatHandler))
	mux.Handle("/connections", middleware.AuthMiddleware(beatHandler))
	mux.Handle("/connections/", middleware.AuthMiddleware(beatHandler))

	mux.Handle("/invitations", middleware.AuthMiddleware(collaboratorHandler))
	mux.Handle("/invitations/", middleware.AuthMiddleware(collaboratorHandler))

	mux.Handle("/lanes", middleware.AuthMiddleware(laneHandler))
	mux.Handle("/lanes/", middleware.AuthMiddleware(laneHandler))
	mux.Handle("/outline-items", middleware.AuthMiddleware(outlineItemHandler))
	mux.Handle("/outline-items/", middleware.AuthMiddleware(outlineItemHandler))

	mux.Handle("/projects/", middleware.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

		if len(pathParts) >= 3 && (pathParts[2] == "beat-board" || pathParts[2] == "beats" || pathParts[2] == "connections") {
			beatHandler.ServeHTTP(w, r)
			return
		}

		if len(pathParts) >= 3 && pathParts[2] == "collaborators" {
			collaboratorHandler.ServeHTTP(w, r)
			return
		}

		if len(pathParts) >= 3 && pathParts[2] == "lanes" {
			laneHandler.ServeHTTP(w, r)
			return
		}

		projectHandler.ServeHTTP(w, r)
	})))

	return mux
}

package router

import (
	"net/http"

	"scriptlith/server/internal/gateway/config"
	"scriptlith/server/internal/gateway/handlers"
	"scriptlith/server/internal/gateway/middleware"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// SetupRouter creates and configures the HTTP router
func SetupRouter(cfg *config.Config) (http.Handler, error) {
	r := chi.NewRouter()

	// Middleware
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.CORS(cfg.AllowedOrigins))

	// Initialize handlers
	authHandler, err := handlers.NewAuthHandler(cfg)
	if err != nil {
		return nil, err
	}

	scriptsHandler, err := handlers.NewScriptsHandler(cfg)
	if err != nil {
		return nil, err
	}

	collaborationHandler, err := handlers.NewCollaborationHandler(cfg)
	if err != nil {
		return nil, err
	}

	aiHandler, err := handlers.NewAIHandler(cfg)
	if err != nil {
		return nil, err
	}

	// Static file serving for uploaded images
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))

	// Public routes (no auth required)
	r.Post("/login", authHandler.Login)
	r.Post("/register", authHandler.Register)

	// Protected routes (require authentication)
	r.Group(func(r chi.Router) {
		// Apply auth middleware
		identityServiceURL := cfg.IdentityService.Host + ":" + cfg.IdentityService.Port
		authMiddleware, err := middleware.NewAuthMiddleware(identityServiceURL)
		if err != nil {
			panic(err)
		}
		r.Use(func(next http.Handler) http.Handler {
			return authMiddleware.Middleware(next)
		})

		// Project routes
		r.Route("/projects", func(r chi.Router) {
			r.Get("/", scriptsHandler.GetUserProjects)
			r.Post("/", scriptsHandler.CreateProject)
			r.Post("/import-fdx", scriptsHandler.ImportFDX)

			// Single project routes
			r.Route("/{projectId}", func(r chi.Router) {
				r.Get("/", scriptsHandler.GetProject)
				r.Delete("/", scriptsHandler.DeleteProject)
				r.Patch("/star", scriptsHandler.ToggleProjectStar)

				// Collaboration routes
				r.Get("/collaborators", collaborationHandler.GetProjectCollaborators)
				r.Post("/collaborators", collaborationHandler.AddCollaborator)
				r.Delete("/collaborators/{userId}", collaborationHandler.RemoveCollaborator)
				r.Patch("/collaborators/{userId}/role", collaborationHandler.UpdateCollaboratorRole)

				// Beat board routes (both with and without /beat-board prefix for backwards compatibility)
				r.Route("/beat-board", func(r chi.Router) {
					r.Get("/", scriptsHandler.GetProjectBeatBoard)
					r.Post("/beats", scriptsHandler.CreateBeat)
					r.Post("/connections", scriptsHandler.CreateConnection)
					r.Get("/lanes", scriptsHandler.GetProjectLanes)
					r.Post("/lanes", scriptsHandler.CreateLane)
					r.Put("/lanes/order", scriptsHandler.UpdateLaneOrder)
					r.Post("/outline-items", scriptsHandler.CreateOutlineItem)
				})

				// Simplified beat-board routes (without /beat-board prefix)
				r.Post("/beats", scriptsHandler.CreateBeat)
				r.Post("/connections", scriptsHandler.CreateConnection)
				r.Get("/lanes", scriptsHandler.GetProjectLanes)
				r.Post("/lanes", scriptsHandler.CreateLane)
				r.Put("/lanes/order", scriptsHandler.UpdateLaneOrder)
				r.Post("/outline-items", scriptsHandler.CreateOutlineItem)
			})
		})

		// Scene routes
		r.Route("/scenes", func(r chi.Router) {
			r.Get("/", scriptsHandler.GetProjectScenes)
			r.Post("/", scriptsHandler.CreateScene)
			r.Put("/{sceneId}", scriptsHandler.UpdateScene)
		})

		// Element routes
		r.Route("/elements", func(r chi.Router) {
			r.Get("/", scriptsHandler.GetSceneElements)
			r.Post("/", scriptsHandler.CreateElement)
			r.Put("/{elementId}", scriptsHandler.UpdateElement)
			r.Patch("/{elementId}", scriptsHandler.UpdateElement)
			r.Delete("/{elementId}", scriptsHandler.DeleteElement)
		})

		// Beat routes
		r.Route("/beats", func(r chi.Router) {
			r.Get("/{beatId}", scriptsHandler.GetBeat)
			r.Patch("/{beatId}", scriptsHandler.UpdateBeat)
			r.Delete("/{beatId}", scriptsHandler.DeleteBeat)
		})

		// Connection routes
		r.Delete("/connections/{connectionId}", scriptsHandler.DeleteConnection)

		// Lane routes
		r.Route("/lanes", func(r chi.Router) {
			r.Put("/{laneId}", scriptsHandler.UpdateLane)
			r.Delete("/{laneId}", scriptsHandler.DeleteLane)
		})

		// Outline item routes
		r.Route("/outline-items", func(r chi.Router) {
			r.Put("/{itemId}", scriptsHandler.UpdateOutlineItem)
			r.Delete("/{itemId}", scriptsHandler.DeleteOutlineItem)
		})

		// Collaboration routes (global)
		r.Route("/collaborators", func(r chi.Router) {
			r.Get("/", collaborationHandler.GetProjectCollaborators)
			r.Post("/", collaborationHandler.AddCollaborator)
			r.Patch("/{collaboratorId}", collaborationHandler.UpdateCollaboratorRole)
			r.Delete("/{collaboratorId}", collaborationHandler.RemoveCollaborator)
		})

		// Comment routes
		r.Route("/comments", func(r chi.Router) {
			r.Post("/", collaborationHandler.AddComment)
			r.Get("/", collaborationHandler.GetComments)
			r.Patch("/{commentId}", collaborationHandler.UpdateComment)
			r.Delete("/{commentId}", collaborationHandler.DeleteComment)
		})

		// Presence routes
		r.Post("/presence", collaborationHandler.UpdatePresence)

		// Invitation routes
		r.Route("/invitations", func(r chi.Router) {
			r.Get("/", collaborationHandler.GetUserInvitations)
			r.Post("/accept", collaborationHandler.AcceptInvitation)
			r.Post("/decline", collaborationHandler.DeclineInvitation)
		})

		// AI routes
		r.Post("/ai/chat", aiHandler.Chat)
		r.Post("/api/ai/chat", aiHandler.Chat)
		r.Get("/api/ai/providers", aiHandler.GetProviders)
		r.Get("/api/ai/health", aiHandler.Health)
	})

	return r, nil
}

package router

import (
	"log/slog"
	"net/http"

	"scriptlith/server/internal/gateway/config"
	"scriptlith/server/internal/gateway/grpcclient"
	"scriptlith/server/internal/gateway/handlers"
	"scriptlith/server/internal/gateway/middleware"
	redisPkg "scriptlith/server/pkg/redis"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

// SetupRouter creates and configures the HTTP router, connecting all middleware,
// gRPC clients, and route groups. Returns the handler ready for http.Server.
func SetupRouter(cfg *config.Config) (http.Handler, error) {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.CORS(cfg.AllowedOrigins))
	r.Use(middleware.RequestLogger())

	// Redis — used for JWT blocklist and rate limiting.
	// If Redis is unavailable at startup we log a warning and continue without it
	// (blocklist checks and rate limiting are skipped in degraded mode).
	var blocklist *middleware.TokenBlocklist
	var rateLimiter *middleware.RateLimiter

	redisClient, err := redisPkg.New(redisPkg.Config{
		Host:     cfg.Redis.Host,
		Port:     cfg.Redis.Port,
		Password: cfg.Redis.Password,
	})
	if err != nil {
		slog.Warn("Redis unavailable — JWT blocklist and rate limiting disabled", "error", err)
	} else {
		blocklist = middleware.NewTokenBlocklist(redisClient)
		rateLimiter = middleware.NewRateLimiter(redisClient, cfg.RateLimitRPM)
	}

	if rateLimiter != nil {
		r.Use(rateLimiter.Middleware)
	}

	// Shared gRPC client registry — one circuit-broken connection per downstream service.
	clients, err := grpcclient.New(cfg)
	if err != nil {
		return nil, err
	}

	// Handlers
	authHandler := handlers.NewAuthHandler(clients, blocklist)
	scriptsHandler := handlers.NewScriptsHandler(clients)
	collaborationHandler := handlers.NewCollaborationHandler(clients)
	workspaceHandler := handlers.NewWorkspaceHandler(clients)
	billingHandler := handlers.NewBillingHandler(clients)

	aiHandler, err := handlers.NewAIHandler(cfg)
	if err != nil {
		return nil, err
	}

	// Auth middleware — shared across all protected route groups.
	identityServiceURL := cfg.IdentityService.Host + ":" + cfg.IdentityService.Port
	authMiddleware, err := middleware.NewAuthMiddleware(identityServiceURL, blocklist)
	if err != nil {
		return nil, err
	}

	// Static file serving for uploaded images (no auth required).
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))

	// ── Legacy public routes (kept for backwards compatibility) ──────────────
	r.Post("/login", authHandler.Login)
	r.Post("/register", authHandler.Register)

	// ── /api/v1 — versioned API ───────────────────────────────────────────────
	r.Route("/api/v1", func(r chi.Router) {
		// Public
		r.Post("/login", authHandler.Login)
		r.Post("/register", authHandler.Register)

		// Protected
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.Middleware)

			// Auth
			r.Post("/logout", authHandler.Logout)
			r.Patch("/users/me", authHandler.UpdateProfile)
			r.Post("/users/me/password", authHandler.ChangePassword)

			// Projects
			r.Route("/projects", func(r chi.Router) {
				r.Get("/", scriptsHandler.GetUserProjects)
				r.Get("/shared", scriptsHandler.GetSharedProjects)
				r.Post("/", scriptsHandler.CreateProject)
				r.Post("/import-fdx", scriptsHandler.ImportFDX)

				r.Route("/{projectId}", func(r chi.Router) {
					r.Get("/", scriptsHandler.GetProject)
					r.Delete("/", scriptsHandler.DeleteProject)
					r.Patch("/star", scriptsHandler.ToggleProjectStar)

					r.Get("/collaborators", collaborationHandler.GetProjectCollaborators)
					r.Post("/collaborators", collaborationHandler.AddCollaborator)
					r.Delete("/collaborators/{userId}", collaborationHandler.RemoveCollaborator)
					r.Patch("/collaborators/{userId}/role", collaborationHandler.UpdateCollaboratorRole)

					r.Route("/beat-board", func(r chi.Router) {
						r.Get("/", scriptsHandler.GetProjectBeatBoard)
						r.Post("/beats", scriptsHandler.CreateBeat)
						r.Post("/connections", scriptsHandler.CreateConnection)
						r.Get("/lanes", scriptsHandler.GetProjectLanes)
						r.Post("/lanes", scriptsHandler.CreateLane)
						r.Put("/lanes/order", scriptsHandler.UpdateLaneOrder)
						r.Patch("/lanes/order", scriptsHandler.UpdateLaneOrder)
						r.Post("/outline-items", scriptsHandler.CreateOutlineItem)
					})

					// Convenience aliases without /beat-board prefix (backwards compat)
					r.Post("/beats", scriptsHandler.CreateBeat)
					r.Post("/connections", scriptsHandler.CreateConnection)
					r.Get("/lanes", scriptsHandler.GetProjectLanes)
					r.Post("/lanes", scriptsHandler.CreateLane)
					r.Put("/lanes/order", scriptsHandler.UpdateLaneOrder)
					r.Patch("/lanes/order", scriptsHandler.UpdateLaneOrder)
					r.Post("/outline-items", scriptsHandler.CreateOutlineItem)
				})
			})

			// Scenes
			r.Route("/scenes", func(r chi.Router) {
				r.Get("/", scriptsHandler.GetProjectScenes)
				r.Post("/", scriptsHandler.CreateScene)
				r.Put("/{sceneId}", scriptsHandler.UpdateScene)
				r.Delete("/{sceneId}", scriptsHandler.DeleteScene)
			})

			// Elements
			r.Route("/elements", func(r chi.Router) {
				r.Get("/", scriptsHandler.GetSceneElements)
				r.Post("/", scriptsHandler.CreateElement)
				r.Put("/{elementId}", scriptsHandler.UpdateElement)
				r.Patch("/{elementId}", scriptsHandler.UpdateElement)
				r.Delete("/{elementId}", scriptsHandler.DeleteElement)
			})

			// Beats
			r.Route("/beats", func(r chi.Router) {
				r.Get("/{beatId}", scriptsHandler.GetBeat)
				r.Patch("/{beatId}", scriptsHandler.UpdateBeat)
				r.Delete("/{beatId}", scriptsHandler.DeleteBeat)
			})

			r.Delete("/connections/{connectionId}", scriptsHandler.DeleteConnection)

			// Lanes
			r.Route("/lanes", func(r chi.Router) {
				r.Put("/{laneId}", scriptsHandler.UpdateLane)
				r.Patch("/{laneId}", scriptsHandler.UpdateLane)
				r.Delete("/{laneId}", scriptsHandler.DeleteLane)
			})

			// Outline items
			r.Route("/outline-items", func(r chi.Router) {
				r.Put("/{itemId}", scriptsHandler.UpdateOutlineItem)
				r.Patch("/{itemId}", scriptsHandler.UpdateOutlineItem)
				r.Delete("/{itemId}", scriptsHandler.DeleteOutlineItem)
			})

			// Collaboration (global — not scoped to a project)
			r.Route("/collaborators", func(r chi.Router) {
				r.Get("/", collaborationHandler.GetProjectCollaborators)
				r.Post("/", collaborationHandler.AddCollaborator)
				r.Patch("/{collaboratorId}", collaborationHandler.UpdateCollaboratorRole)
				r.Delete("/{collaboratorId}", collaborationHandler.RemoveCollaborator)
			})

			// Comments
			r.Route("/comments", func(r chi.Router) {
				r.Post("/", collaborationHandler.AddComment)
				r.Get("/", collaborationHandler.GetComments)
				r.Patch("/{commentId}", collaborationHandler.UpdateComment)
				r.Delete("/{commentId}", collaborationHandler.DeleteComment)
			})

			r.Post("/presence", collaborationHandler.UpdatePresence)

			// Invitations
			r.Route("/invitations", func(r chi.Router) {
				r.Get("/", collaborationHandler.GetUserInvitations)
				r.Post("/accept", collaborationHandler.AcceptInvitation)
				r.Post("/decline", collaborationHandler.DeclineInvitation)
			})

			// Admin billing
			r.Route("/admin/billing", func(r chi.Router) {
				r.Get("/tiers", billingHandler.GetTiers)
				r.Get("/analytics", billingHandler.GetAnalytics)
				r.Get("/gateways", billingHandler.GetGateways)
				r.Get("/subscriptions", billingHandler.GetSubscriptions)
			})

			// AI
			r.Post("/ai/chat", aiHandler.Chat)
			r.Get("/ai/providers", aiHandler.GetProviders)
			r.Get("/ai/health", aiHandler.Health)

			// Workspaces
			r.Get("/categories", workspaceHandler.ListCategories)
			r.Route("/workspaces", func(r chi.Router) {
				r.Get("/", workspaceHandler.ListUserWorkspaces)
				r.Post("/personal", workspaceHandler.CreatePersonalWorkspaces)
				r.Post("/org", workspaceHandler.CreateOrgWorkspace)

				r.Post("/invites/{token}/accept", workspaceHandler.AcceptInvite)
				r.Post("/invites/{token}/decline", workspaceHandler.DeclineInvite)

				r.Route("/{workspaceId}", func(r chi.Router) {
					r.Get("/", workspaceHandler.GetWorkspace)
					r.Patch("/", workspaceHandler.UpdateWorkspace)
					r.Delete("/", workspaceHandler.DeleteWorkspace)

					r.Post("/categories/{slug}", workspaceHandler.EnableCategory)
					r.Delete("/categories/{slug}", workspaceHandler.DisableCategory)

					r.Get("/members", workspaceHandler.ListMembers)
					r.Post("/members/invite", workspaceHandler.InviteMember)
					r.Patch("/members/{userId}/role", workspaceHandler.UpdateMemberRole)
					r.Delete("/members/{userId}", workspaceHandler.RemoveMember)
				})
			})
		})
	})

	// ── Legacy protected routes (kept so existing frontend still works) ───────
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware.Middleware)

		r.Patch("/users/me", authHandler.UpdateProfile)
		r.Post("/users/me/password", authHandler.ChangePassword)

		r.Route("/projects", func(r chi.Router) {
			r.Get("/", scriptsHandler.GetUserProjects)
			r.Get("/shared", scriptsHandler.GetSharedProjects)
			r.Post("/", scriptsHandler.CreateProject)
			r.Post("/import-fdx", scriptsHandler.ImportFDX)

			r.Route("/{projectId}", func(r chi.Router) {
				r.Get("/", scriptsHandler.GetProject)
				r.Delete("/", scriptsHandler.DeleteProject)
				r.Patch("/star", scriptsHandler.ToggleProjectStar)

				r.Get("/collaborators", collaborationHandler.GetProjectCollaborators)
				r.Post("/collaborators", collaborationHandler.AddCollaborator)
				r.Delete("/collaborators/{userId}", collaborationHandler.RemoveCollaborator)
				r.Patch("/collaborators/{userId}/role", collaborationHandler.UpdateCollaboratorRole)

				r.Route("/beat-board", func(r chi.Router) {
					r.Get("/", scriptsHandler.GetProjectBeatBoard)
					r.Post("/beats", scriptsHandler.CreateBeat)
					r.Post("/connections", scriptsHandler.CreateConnection)
					r.Get("/lanes", scriptsHandler.GetProjectLanes)
					r.Post("/lanes", scriptsHandler.CreateLane)
					r.Put("/lanes/order", scriptsHandler.UpdateLaneOrder)
					r.Patch("/lanes/order", scriptsHandler.UpdateLaneOrder)
					r.Post("/outline-items", scriptsHandler.CreateOutlineItem)
				})

				r.Post("/beats", scriptsHandler.CreateBeat)
				r.Post("/connections", scriptsHandler.CreateConnection)
				r.Get("/lanes", scriptsHandler.GetProjectLanes)
				r.Post("/lanes", scriptsHandler.CreateLane)
				r.Put("/lanes/order", scriptsHandler.UpdateLaneOrder)
				r.Patch("/lanes/order", scriptsHandler.UpdateLaneOrder)
				r.Post("/outline-items", scriptsHandler.CreateOutlineItem)
			})
		})

		r.Route("/scenes", func(r chi.Router) {
			r.Get("/", scriptsHandler.GetProjectScenes)
			r.Post("/", scriptsHandler.CreateScene)
			r.Put("/{sceneId}", scriptsHandler.UpdateScene)
			r.Delete("/{sceneId}", scriptsHandler.DeleteScene)
		})

		r.Route("/elements", func(r chi.Router) {
			r.Get("/", scriptsHandler.GetSceneElements)
			r.Post("/", scriptsHandler.CreateElement)
			r.Put("/{elementId}", scriptsHandler.UpdateElement)
			r.Patch("/{elementId}", scriptsHandler.UpdateElement)
			r.Delete("/{elementId}", scriptsHandler.DeleteElement)
		})

		r.Route("/beats", func(r chi.Router) {
			r.Get("/{beatId}", scriptsHandler.GetBeat)
			r.Patch("/{beatId}", scriptsHandler.UpdateBeat)
			r.Delete("/{beatId}", scriptsHandler.DeleteBeat)
		})

		r.Delete("/connections/{connectionId}", scriptsHandler.DeleteConnection)

		r.Route("/lanes", func(r chi.Router) {
			r.Put("/{laneId}", scriptsHandler.UpdateLane)
			r.Patch("/{laneId}", scriptsHandler.UpdateLane)
			r.Delete("/{laneId}", scriptsHandler.DeleteLane)
		})

		r.Route("/outline-items", func(r chi.Router) {
			r.Put("/{itemId}", scriptsHandler.UpdateOutlineItem)
			r.Patch("/{itemId}", scriptsHandler.UpdateOutlineItem)
			r.Delete("/{itemId}", scriptsHandler.DeleteOutlineItem)
		})

		r.Route("/collaborators", func(r chi.Router) {
			r.Get("/", collaborationHandler.GetProjectCollaborators)
			r.Post("/", collaborationHandler.AddCollaborator)
			r.Patch("/{collaboratorId}", collaborationHandler.UpdateCollaboratorRole)
			r.Delete("/{collaboratorId}", collaborationHandler.RemoveCollaborator)
		})

		r.Route("/comments", func(r chi.Router) {
			r.Post("/", collaborationHandler.AddComment)
			r.Get("/", collaborationHandler.GetComments)
			r.Patch("/{commentId}", collaborationHandler.UpdateComment)
			r.Delete("/{commentId}", collaborationHandler.DeleteComment)
		})

		r.Post("/presence", collaborationHandler.UpdatePresence)

		r.Route("/invitations", func(r chi.Router) {
			r.Get("/", collaborationHandler.GetUserInvitations)
			r.Post("/accept", collaborationHandler.AcceptInvitation)
			r.Post("/decline", collaborationHandler.DeclineInvitation)
		})

		r.Route("/api/admin/billing", func(r chi.Router) {
			r.Get("/tiers", billingHandler.GetTiers)
			r.Get("/analytics", billingHandler.GetAnalytics)
			r.Get("/gateways", billingHandler.GetGateways)
			r.Get("/subscriptions", billingHandler.GetSubscriptions)
		})

		r.Post("/ai/chat", aiHandler.Chat)
		r.Post("/api/ai/chat", aiHandler.Chat)
		r.Get("/api/ai/providers", aiHandler.GetProviders)
		r.Get("/api/ai/health", aiHandler.Health)

		r.Get("/categories", workspaceHandler.ListCategories)

		r.Route("/workspaces", func(r chi.Router) {
			r.Get("/", workspaceHandler.ListUserWorkspaces)
			r.Post("/personal", workspaceHandler.CreatePersonalWorkspaces)
			r.Post("/org", workspaceHandler.CreateOrgWorkspace)

			r.Post("/invites/{token}/accept", workspaceHandler.AcceptInvite)
			r.Post("/invites/{token}/decline", workspaceHandler.DeclineInvite)

			r.Route("/{workspaceId}", func(r chi.Router) {
				r.Get("/", workspaceHandler.GetWorkspace)
				r.Patch("/", workspaceHandler.UpdateWorkspace)
				r.Delete("/", workspaceHandler.DeleteWorkspace)

				r.Post("/categories/{slug}", workspaceHandler.EnableCategory)
				r.Delete("/categories/{slug}", workspaceHandler.DisableCategory)

				r.Get("/members", workspaceHandler.ListMembers)
				r.Post("/members/invite", workspaceHandler.InviteMember)
				r.Patch("/members/{userId}/role", workspaceHandler.UpdateMemberRole)
				r.Delete("/members/{userId}", workspaceHandler.RemoveMember)
			})
		})
	})

	return r, nil
}

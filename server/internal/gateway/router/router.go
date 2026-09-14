package router

import (
	"context"
	"log/slog"
	"net/http"

	"inkwell/server/internal/gateway/config"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers/ai"
	"inkwell/server/internal/gateway/handlers/aisettings"
	"inkwell/server/internal/gateway/handlers/auth"
	"inkwell/server/internal/gateway/handlers/billing"
	"inkwell/server/internal/gateway/handlers/collab"
	"inkwell/server/internal/gateway/handlers/notifications"
	"inkwell/server/internal/gateway/handlers/scripts"
	"inkwell/server/internal/gateway/handlers/workspace"
	"inkwell/server/internal/gateway/middleware"
	"inkwell/server/internal/gateway/notify"
	"inkwell/server/internal/gateway/realtime"
	redisPkg "inkwell/server/pkg/redis"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/redis/go-redis/v9"
)

// SetupRouter creates and configures the HTTP router, connecting all middleware,
// gRPC clients, and route groups. Returns the handler ready for http.Server.
func SetupRouter(cfg *config.Config) (http.Handler, error) {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CORS(cfg.AllowedOrigins, cfg.Environment))
	r.Use(middleware.OriginCheck(cfg.AllowedOrigins, cfg.Environment))
	r.Use(middleware.RequestLogger())

	// Redis — used for JWT blocklist and rate limiting.
	// If Redis is unavailable at startup we log a warning and continue without it
	// (blocklist checks and rate limiting are skipped in degraded mode).
	var blocklist *middleware.TokenBlocklist
	var rateLimiter *middleware.RateLimiter
	var authRateLimiter *middleware.RateLimiter
	var aiRateLimiter *middleware.RateLimiter

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
		// Much tighter per-IP bucket for credential-heavy endpoints (login,
		// register, password change) so online brute-forcing is uneconomical.
		authRateLimiter = middleware.NewNamedRateLimiter(redisClient, cfg.AuthRateLimitRPM, "ratelimit:auth")
		// Per-user bucket on AI endpoints — a single account can rack up
		// provider bills (chat) or enumerate provider ids (settings),
		// regardless of source IP. Applied post-auth via UserMiddleware.
		aiRateLimiter = middleware.NewNamedRateLimiter(redisClient, cfg.AIRateLimitRPM, "ratelimit:ai")
	}

	if rateLimiter != nil {
		r.Use(rateLimiter.Middleware)
	}

	// authLimit returns the per-route middleware chain for auth endpoints.
	// When Redis is down it degrades to a no-op wrapper so routing still works.
	authLimit := func(next http.HandlerFunc) http.HandlerFunc {
		if authRateLimiter == nil {
			return next
		}
		return authRateLimiter.Middleware(next).ServeHTTP
	}

	// aiLimit wraps a handler with the per-user AI rate limit. No-op when
	// Redis is down, same as authLimit. Runs AFTER AuthMiddleware so the
	// user id is available on the context.
	aiLimit := func(next http.HandlerFunc) http.HandlerFunc {
		if aiRateLimiter == nil {
			return next
		}
		return aiRateLimiter.UserMiddleware(next).ServeHTTP
	}

	// Shared gRPC client registry — one circuit-broken connection per downstream service.
	clients, err := grpcclient.New(cfg)
	if err != nil {
		return nil, err
	}

	// Handlers
	authHandler := auth.NewAuthHandler(clients, blocklist, cfg.Environment)
	scriptsHandler := scripts.NewScriptsHandler(clients)

	// User-level notification socket — pushes a small hint (a new invitation
	// today) to a user's browser so it shows without a refresh. Fans out over
	// Redis across gateway instances, or runs local-only without it.
	notifyHub := notify.NewHub(nil)
	if redisClient != nil {
		notifyHub = notify.NewHub(redisClient.Raw())
	}
	go notifyHub.Run(context.Background())
	notifyHandler := notify.NewHandler(notifyHub, cfg.AllowedOrigins)

	collaborationHandler := collab.NewCollaborationHandler(clients, notifyHub)
	workspaceHandler := workspace.NewWorkspaceHandler(clients)
	billingHandler := billing.NewBillingHandler(clients)

	var aiRedis *redis.Client
	if redisClient != nil {
		aiRedis = redisClient.Raw()
	}
	aiHandler, err := ai.NewAIHandler(cfg, clients, aiRedis)
	if err != nil {
		return nil, err
	}
	aiSettingsHandler := aisettings.NewAISettingsHandler(clients, cfg.OpenAICompatibleHosts)
	notificationsHandler := notifications.NewNotificationsHandler(clients)
	// Realtime cross-instance plumbing (pub/sub fan-out + shared presence
	// roster) rides Redis when available, so editors on different gateway
	// instances see each other; otherwise it runs local-only (a single
	// instance is already complete in-process).
	var realtimeCluster *realtime.Cluster
	if redisClient != nil {
		realtimeCluster = realtime.NewCluster(redisClient.Raw())
	}
	realtimeHandler := realtime.NewHandler(clients, cfg.AllowedOrigins, realtimeCluster)

	// Auth middleware — shared across all protected route groups.
	identityServiceURL := cfg.IdentityService.Host + ":" + cfg.IdentityService.Port
	authMiddleware, err := middleware.NewAuthMiddleware(identityServiceURL, blocklist)
	if err != nil {
		return nil, err
	}

	// Static file serving for uploaded images (no auth required).
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))

	// ── /api/v1 — the single versioned API tree ──────────────────────────────
	r.Route("/api/v1", func(r chi.Router) {
		// Public
		r.Post("/login", authLimit(authHandler.Login))
		r.Post("/register", authLimit(authHandler.Register))
		// Refresh is public: the access token has usually expired by the time
		// it's called (auth is by the refresh token in the body, not a session).
		r.Post("/auth/refresh", authLimit(authHandler.RefreshToken))

		// Payment-gateway webhooks are public: the provider authenticates by
		// signing the body, not with a session cookie. Verification happens in
		// the billing service over the raw bytes.
		r.Post("/billing/webhooks/paddle", billingHandler.PaddleWebhook)

		// Protected
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.Middleware)

			// Auth
			r.Post("/logout", authHandler.Logout)
			r.Get("/users/me", authHandler.Me)
			r.Patch("/users/me", authHandler.UpdateProfile)
			r.Post("/users/me/password", authLimit(authHandler.ChangePassword))
			r.Post("/users/me/avatar", authHandler.UploadAvatar)
			r.Get("/users/me/sessions", authHandler.ListSessions)
			r.Delete("/users/me/sessions/{sessionId}", authHandler.RevokeSession)
			r.Post("/users/me/2fa/enroll", authHandler.EnrollTwoFactor)
			r.Post("/users/me/2fa/verify", authHandler.ConfirmTwoFactor)
			r.Post("/users/me/2fa/disable", authHandler.DisableTwoFactor)

			// Account deletion + data control (Settings → Data Controls).
			// verify-password is a credential check → per-IP auth limiter.
			r.Post("/users/verify-password", authLimit(authHandler.VerifyPassword))
			r.Delete("/users/delete-account", authHandler.DeleteAccount)
			r.Post("/users/data-deletion-request", authHandler.RequestDataDeletion)
			r.Get("/users/data-deletion-request/status", authHandler.GetDataDeletionStatus)

			// Sync — bidirectional per-project reconcile for the desktop client.
			r.Post("/sync/projects/{projectId}", scriptsHandler.SyncProject)
			// Vault sync — path-keyed file reconcile for vault projects.
			r.Post("/sync/vault/projects/{projectId}", scriptsHandler.SyncVault)

			// Real-time editing — WebSocket per project. Auth runs via the group
			// middleware; the handler then checks project access before upgrading.
			r.Get("/ws/projects/{projectId}", realtimeHandler.HandleWS)
			// User-level notification socket — pushes invites (and future
			// notifications) to the authenticated user's own room.
			r.Get("/ws/user", notifyHandler.HandleWS)

			// Projects
			r.Route("/projects", func(r chi.Router) {
				r.Get("/", scriptsHandler.GetUserProjects)
				r.Get("/shared", scriptsHandler.GetSharedProjects)
				r.Post("/", scriptsHandler.CreateProject)
				r.Post("/import-fdx", scriptsHandler.ImportFDX)

				r.Route("/{projectId}", func(r chi.Router) {
					r.Get("/", scriptsHandler.GetProject)
					r.Put("/", scriptsHandler.UpdateProject)
					r.Delete("/", scriptsHandler.DeleteProject)
					r.Patch("/star", scriptsHandler.ToggleProjectStar)
					r.Get("/export", scriptsHandler.ExportProject)

					r.Get("/collaborators", collaborationHandler.GetProjectCollaborators)
					r.Post("/collaborators", collaborationHandler.AddCollaborator)

					// Durable advisory edit locks — who has the project open and
					// where. Seeds soft-lock markers on open (live updates still
					// arrive over the /ws WebSocket).
					r.Get("/edit-sessions", collaborationHandler.GetEditSessions)
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
						r.Post("/drawings", scriptsHandler.CreateDrawing)
					})
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
				r.Post("/upload-image", scriptsHandler.UploadBeatImage)
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

			// Drawings (beat-board drawing layer)
			r.Route("/drawings", func(r chi.Router) {
				r.Patch("/{drawingId}", scriptsHandler.UpdateDrawing)
				r.Delete("/{drawingId}", scriptsHandler.DeleteDrawing)
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

			// Billing (current user) — their own effective tier + subscription
			// status, the public tier list, and the upgrade checkout.
			r.Get("/billing/me", billingHandler.GetMyBilling)
			r.Get("/billing/tiers", billingHandler.GetPublicTiers)
			r.Post("/billing/checkout", billingHandler.CreateCheckout)

			// Admin billing — requires role=admin in addition to authentication.
			r.Route("/admin/billing", func(r chi.Router) {
				r.Use(middleware.RequireAdmin)
				// Tier CRUD (admin tier editor). Static /reorder before /{id}.
				r.Route("/tiers", func(r chi.Router) {
					r.Get("/", billingHandler.GetTiers)
					r.Post("/", billingHandler.CreateTier)
					r.Post("/reorder", billingHandler.ReorderTiers)
					r.Get("/{id}", billingHandler.GetTier)
					r.Put("/{id}", billingHandler.UpdateTier)
					r.Delete("/{id}", billingHandler.DeleteTier)
				})
				r.Get("/analytics", billingHandler.GetAnalytics)
				r.Get("/gateways", billingHandler.GetGateways)
				r.Get("/subscriptions", billingHandler.GetSubscriptions)
			})

			// AI — chat goes through the per-user limiter because provider
			// bills accrue per account, not per IP.
			r.Post("/ai/chat", aiLimit(aiHandler.Chat))
			r.Post("/ai/approvals/{checkpointId}", aiLimit(aiHandler.DecideApproval))
			// Managed AI providers offered by this deployment (Inkwell-keyed).
			r.Get("/ai/managed", aiHandler.ManagedProviders)

			// AI provider BYO settings — CRUD + key management. Plaintext
			// keys accepted on SetKey only; all other responses omit them.
			// Per-id reads/writes go through the per-user limiter to make
			// provider-id enumeration uneconomical.
			r.Route("/ai/settings", func(r chi.Router) {
				r.Get("/", aiSettingsHandler.List)
				r.Post("/", aiSettingsHandler.Create)
				r.Route("/{id}", func(r chi.Router) {
					r.Put("/", aiLimit(aiSettingsHandler.Update))
					r.Delete("/", aiLimit(aiSettingsHandler.Delete))
					r.Post("/key", aiLimit(aiSettingsHandler.SetKey))
					r.Delete("/key", aiLimit(aiSettingsHandler.ClearKey))
				})
			})

			// Notifications — per-user delivery preferences + the in-app feed.
			// Static segments (preferences / unread-count / read-all) are
			// declared before the /{id}/read wildcard so chi matches them first.
			r.Route("/notifications", func(r chi.Router) {
				r.Get("/", notificationsHandler.List)
				r.Get("/preferences", notificationsHandler.GetPreferences)
				r.Put("/preferences", notificationsHandler.UpdatePreferences)
				r.Get("/unread-count", notificationsHandler.UnreadCount)
				r.Post("/read-all", notificationsHandler.MarkAllRead)
				r.Post("/{id}/read", notificationsHandler.MarkRead)
			})

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

			// Organizations — first-class team entity (distinct from personal
			// workspaces). Member mutations are gated on the caller's resolved
			// org role inside each handler.
			r.Route("/organizations", func(r chi.Router) {
				r.Get("/", workspaceHandler.ListOrganizations)
				r.Post("/", workspaceHandler.CreateOrganization)

				r.Get("/invites/incoming", workspaceHandler.ListIncomingOrgInvites)
				r.Post("/invites/{token}/accept", workspaceHandler.AcceptOrgInvite)
				r.Post("/invites/{token}/decline", workspaceHandler.DeclineOrgInvite)

				r.Route("/{orgId}", func(r chi.Router) {
					r.Get("/", workspaceHandler.GetOrganization)
					r.Patch("/", workspaceHandler.UpdateOrganization)
					r.Put("/", workspaceHandler.UpdateOrganization)
					r.Delete("/", workspaceHandler.DeleteOrganization)

					r.Get("/projects", scriptsHandler.GetOrgProjects)
					r.Get("/seats", workspaceHandler.OrgSeats)
					r.Put("/seats", workspaceHandler.SetOrgSeats)

					r.Get("/members", workspaceHandler.ListOrgMembers)
					r.Post("/members/invite", workspaceHandler.InviteOrgMember)
					r.Patch("/members/{userId}/role", workspaceHandler.UpdateOrgMemberRole)
					r.Put("/members/{userId}/role", workspaceHandler.UpdateOrgMemberRole)
					r.Delete("/members/{userId}", workspaceHandler.RemoveOrgMember)
				})
			})
		})
	})

	return r, nil
}

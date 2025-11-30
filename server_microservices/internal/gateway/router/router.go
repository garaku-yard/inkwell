package router

import (
	"fmt"
	"net/http"

	"scriptlith/server_microservices/internal/gateway/config"
	"scriptlith/server_microservices/internal/gateway/handlers"
	"scriptlith/server_microservices/internal/gateway/middleware"
)

// SetupRouter creates and configures the HTTP router
func SetupRouter(cfg *config.Config) (http.Handler, error) {
	mux := http.NewServeMux()

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

	// Auth routes
	mux.HandleFunc("/login", authHandler.Login)
	mux.HandleFunc("/register", authHandler.Register)

	// Scripts routes
	mux.HandleFunc("/projects", func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("DEBUG: /projects route called with method: %s\n", r.Method)
		switch r.Method {
		case http.MethodPost:
			fmt.Printf("DEBUG: Calling scriptsHandler.CreateProject\n")
			scriptsHandler.CreateProject(w, r)
		case http.MethodGet:
			scriptsHandler.GetUserProjects(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/projects/", scriptsHandler.GetProject)

	// Scenes routes
	mux.HandleFunc("/scenes", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			scriptsHandler.CreateScene(w, r)
		case http.MethodGet:
			scriptsHandler.GetProjectScenes(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/scenes/", scriptsHandler.UpdateScene)

	// Elements routes
	mux.HandleFunc("/elements", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			scriptsHandler.CreateElement(w, r)
		case http.MethodGet:
			scriptsHandler.GetSceneElements(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/elements/", scriptsHandler.UpdateElement)

	// Collaboration routes
	mux.HandleFunc("/collaborators", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			collaborationHandler.AddCollaborator(w, r)
		case http.MethodGet:
			collaborationHandler.GetProjectCollaborators(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Individual collaborator routes
	mux.HandleFunc("/collaborators/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch:
			collaborationHandler.UpdateCollaboratorRole(w, r)
		case http.MethodDelete:
			collaborationHandler.RemoveCollaborator(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/comments", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			collaborationHandler.AddComment(w, r)
		case http.MethodGet:
			collaborationHandler.GetComments(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Individual comment routes
	mux.HandleFunc("/comments/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch:
			collaborationHandler.UpdateComment(w, r)
		case http.MethodDelete:
			collaborationHandler.DeleteComment(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/presence", collaborationHandler.UpdatePresence)

	// Invitation routes
	mux.HandleFunc("/invitations", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			collaborationHandler.GetUserInvitations(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/invitations/accept", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			collaborationHandler.AcceptInvitation(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/invitations/decline", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			collaborationHandler.DeclineInvitation(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"api-gateway"}`))
	})

	// Apply middleware in the correct order
	var handler http.Handler = mux

	// Apply authentication middleware first (innermost)
	identityServiceURL := cfg.IdentityService.Host + ":" + cfg.IdentityService.Port
	authMiddleware, err := middleware.NewAuthMiddleware(identityServiceURL)
	if err != nil {
		return nil, err
	}
	handler = authMiddleware.Middleware(handler)

	// Then apply other middleware (outermost)
	handler = middleware.Recovery(handler)
	handler = middleware.Logging(handler)
	handler = middleware.CORS(cfg.AllowedOrigins)(handler)

	return handler, nil
}

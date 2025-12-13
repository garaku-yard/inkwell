package router

import (
	"fmt"
	"net/http"
	"strings"

	"scriptlith/server_microservices/internal/gateway/config"
	"scriptlith/server_microservices/internal/gateway/handlers"
	"scriptlith/server_microservices/internal/gateway/middleware"
)

// splitPath splits a URL path by "/" and filters out empty strings
func splitPath(path string) []string {
	parts := strings.Split(path, "/")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

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

	aiHandler, err := handlers.NewAIHandler(cfg)
	if err != nil {
		return nil, err
	}

	// Static file serving for uploaded images
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))

	// Auth routes
	mux.HandleFunc("/login", authHandler.Login)
	mux.HandleFunc("/register", authHandler.Register)

	// Import routes
	mux.HandleFunc("/projects/import-fdx", scriptsHandler.ImportFDX)

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

	mux.HandleFunc("/projects/", func(w http.ResponseWriter, r *http.Request) {
		// Parse URL to check for beat-board routes
		if r.URL.Path[len("/projects/"):] != "" && len(r.URL.Path) > len("/projects/") {
			parts := splitPath(r.URL.Path[len("/projects/"):])

			// Check for beat-board routes with /projects/{id}/beat-board pattern
			if len(parts) >= 2 && parts[1] == "beat-board" {
				if len(parts) == 2 {
					// GET /projects/{id}/beat-board
					if r.Method == http.MethodGet {
						scriptsHandler.GetProjectBeatBoard(w, r)
						return
					}
				} else if len(parts) >= 3 {
					switch parts[2] {
					case "beats":
						// POST /projects/{id}/beat-board/beats
						if r.Method == http.MethodPost {
							scriptsHandler.CreateBeat(w, r)
							return
						}
					case "connections":
						// POST /projects/{id}/beat-board/connections
						if r.Method == http.MethodPost {
							scriptsHandler.CreateConnection(w, r)
							return
						}
					case "lanes":
						if len(parts) == 3 {
							// GET/POST /projects/{id}/beat-board/lanes
							if r.Method == http.MethodGet {
								scriptsHandler.GetProjectLanes(w, r)
								return
							} else if r.Method == http.MethodPost {
								scriptsHandler.CreateLane(w, r)
								return
							}
						} else if len(parts) == 4 && parts[3] == "order" {
							// PUT /projects/{id}/beat-board/lanes/order
							if r.Method == http.MethodPut {
								scriptsHandler.UpdateLaneOrder(w, r)
								return
							}
						}
					case "outline-items":
						// POST /projects/{id}/beat-board/outline-items
						if r.Method == http.MethodPost {
							scriptsHandler.CreateOutlineItem(w, r)
							return
						}
					}
				}
			}

			// Check for simplified beat-board routes with /projects/{id}/{resource} pattern
			if len(parts) == 2 {
				switch parts[1] {
				case "beats":
					// POST /projects/{id}/beats
					if r.Method == http.MethodPost {
						scriptsHandler.CreateBeat(w, r)
						return
					}
				case "connections":
					// POST /projects/{id}/connections
					if r.Method == http.MethodPost {
						scriptsHandler.CreateConnection(w, r)
						return
					}
				case "lanes":
					// GET/POST /projects/{id}/lanes
					if r.Method == http.MethodGet {
						scriptsHandler.GetProjectLanes(w, r)
						return
					} else if r.Method == http.MethodPost {
						scriptsHandler.CreateLane(w, r)
						return
					}
				case "outline-items":
					// POST /projects/{id}/outline-items
					if r.Method == http.MethodPost {
						scriptsHandler.CreateOutlineItem(w, r)
						return
					}
				}
			} else if len(parts) == 3 && parts[1] == "lanes" && parts[2] == "order" {
				// PUT /projects/{id}/lanes/order
				if r.Method == http.MethodPut {
					scriptsHandler.UpdateLaneOrder(w, r)
					return
				}
			}
		}

		// Default: GET /projects/{id} - get single project
		scriptsHandler.GetProject(w, r)
	})

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

	mux.HandleFunc("/elements/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			scriptsHandler.UpdateElement(w, r)
		case http.MethodDelete:
			scriptsHandler.DeleteElement(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

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

	// Beat image upload endpoint
	mux.HandleFunc("/beats/upload-image", scriptsHandler.UploadBeatImage)

	// Beat Board individual resource routes
	// Individual beat operations
	mux.HandleFunc("/beats/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut, http.MethodPatch:
			scriptsHandler.UpdateBeat(w, r)
		case http.MethodDelete:
			scriptsHandler.DeleteBeat(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Individual connection operations
	mux.HandleFunc("/connections/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			scriptsHandler.DeleteConnection(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Individual lane operations
	mux.HandleFunc("/lanes/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut, http.MethodPatch:
			scriptsHandler.UpdateLane(w, r)
		case http.MethodDelete:
			scriptsHandler.DeleteLane(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Individual outline item operations
	mux.HandleFunc("/outline-items/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut, http.MethodPatch:
			scriptsHandler.UpdateOutlineItem(w, r)
		case http.MethodDelete:
			scriptsHandler.DeleteOutlineItem(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// AI routes
	mux.HandleFunc("/api/ai/chat", aiHandler.Chat)
	mux.HandleFunc("/api/ai/providers", aiHandler.GetProviders)
	mux.HandleFunc("/api/ai/health", aiHandler.Health)

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

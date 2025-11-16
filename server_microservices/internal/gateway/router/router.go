package router

import (
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

	// Auth routes
	mux.HandleFunc("/login", authHandler.Login)
	mux.HandleFunc("/register", authHandler.Register)

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"api-gateway"}`))
	})

	// Apply middleware
	var handler http.Handler = mux
	handler = middleware.Recovery(handler)
	handler = middleware.Logging(handler)
	handler = middleware.CORS(cfg.AllowedOrigins)(handler)

	return handler, nil
}

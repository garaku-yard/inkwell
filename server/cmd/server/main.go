// file: cmd/server/main.go
package main

import (
	"log"
	"net/http"

	"github.com/joho/godotenv"
	"github.com/rs/cors"

	"github.com/l1roii/screenwriter/server/internal/handler"
	"github.com/l1roii/screenwriter/server/internal/repository"
	"github.com/l1roii/screenwriter/server/internal/router"
	"github.com/l1roii/screenwriter/server/pkg/database"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("Warning: .env file not found, using system environment variables.")
	}

	db, err := database.ConnectDB()
	if err != nil {
		log.Fatalf("Could not connect to database: %v", err)
	}
	defer db.Close()

	// --- Initialize Repositories ---
	userRepo := repository.NewUserRepository(db)
	projectRepo := repository.NewProjectRepository(db)
	// NEW: Create the new collaborator repository.
	collabRepo := repository.NewCollaboratorRepository(db)

	// --- Initialize Handlers ---
	authHandler := handler.NewAuthHandler(userRepo)
	// UPDATED: The project handler now receives all the repositories it needs.
	projectHandler := handler.NewProjectHandler(projectRepo, userRepo, collabRepo)

	// --- Set up Router & CORS ---
	mux := router.NewRouter(authHandler, projectHandler)

	c := cors.New(cors.Options{
		AllowedOrigins: []string{"http://localhost:3000"},
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Authorization", "Content-Type"},
	})
	httpHandler := c.Handler(mux)

	// --- Start Server ---
	log.Println("Starting server on :8080")
	err = http.ListenAndServe(":8080", httpHandler)
	if err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

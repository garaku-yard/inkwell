package main

import (
	"log"
	"net/http"

	"github.com/joho/godotenv"
	"github.com/l1roii/screenwriter/server/internal/database"
	"github.com/l1roii/screenwriter/server/internal/handler"
	"github.com/l1roii/screenwriter/server/internal/repository"

	"github.com/l1roii/screenwriter/server/internal/router"
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

	// --- Initialize Repositories & Handlers ---
	userRepo := repository.NewUserRepository(db)
	projectRepo := repository.NewProjectRepository(db)

	authHandler := handler.NewAuthHandler(userRepo)
	projectHandler := handler.NewProjectHandler(projectRepo)

	// --- Set up Router ---
	// All routing logic is now handled by the router package.
	// We just pass the handlers it needs.
	mux := router.NewRouter(authHandler, projectHandler)

	log.Println("Starting server on :8080")
	err = http.ListenAndServe(":8080", mux)
	if err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

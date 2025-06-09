package main

import (
	"log"
	"net/http"

	"github.com/l1roii/screenwriter/server/internal/handler"
	"github.com/l1roii/screenwriter/server/internal/repository"
	"github.com/l1roii/screenwriter/server/pkg/database"
)

func main() {
	// 1. Connect to the database (you already have this)
	db, err := database.ConnectDB()
	if err != nil {
		log.Fatalf("Could not connect to database: %v", err)
	}

	// 2. Initialize the new project repository
	projectRepo := repository.NewProjectRepository(db)

	// 3. Initialize the new project handler, injecting the repository
	projectHandler := handler.NewProjectHandler(projectRepo)

	// 4. Register the new handler with your router
	// (This depends on your router setup, but here's a simple example)
	mux := http.NewServeMux()
	mux.Handle("/projects", projectHandler) // The handler will manage its own sub-routes

	log.Println("Starting server on :8080")
	http.ListenAndServe(":8080", mux)
}

package main

import (
	"log"
	"net/http"

	// This is the library to load the .env file
	"github.com/joho/godotenv"

	// Your local packages, using the correct module path
	"github.com/l1roii/screenwriter/server/internal/handler"
	"github.com/l1roii/screenwriter/server/internal/repository"
	"github.com/l1roii/screenwriter/server/pkg/database"
)

func main() {
	// Load environment variables from .env file at the very start.
	// This is where the .env file is read.
	err := godotenv.Load()
	if err != nil {
		// This is not a fatal error. It allows the app to run in production
		// where environment variables are set directly on the system.
		log.Println("Warning: .env file not found, using system environment variables.")
	}

	// 1. Connect to the database
	// The ConnectDB function will now be able to find the variables loaded from the .env file.
	db, err := database.ConnectDB()
	if err != nil {
		log.Fatalf("Could not connect to database: %v", err)
	}
	// It's good practice to ensure the database connection is closed when main exits.
	defer db.Close()

	// 2. Initialize the repository layer
	// We pass the database connection pool to our repository.
	projectRepo := repository.NewProjectRepository(db)

	// 3. Initialize the handler layer
	// We pass the repository to our handler.
	projectHandler := handler.NewProjectHandler(projectRepo)

	// 4. Set up the router (aka "mux")
	// The router directs incoming requests to the correct handler.
	mux := http.NewServeMux()
	mux.Handle("/projects", projectHandler)
	// You can add more routes here as you create more handlers
	// mux.Handle("/users", userHandler)

	// 5. Start the HTTP server
	log.Println("Starting server on :8080")
	err = http.ListenAndServe(":8080", mux)
	if err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

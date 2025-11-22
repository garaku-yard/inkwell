package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"scriptlith/server_microservices/internal/collab/config"
	"scriptlith/server_microservices/internal/collab/handlers"
	"scriptlith/server_microservices/internal/collab/repository"
	"scriptlith/server_microservices/internal/collab/service"
	"scriptlith/server_microservices/pkg/database"
	"scriptlith/server_microservices/pkg/grpc/collab"
)

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Connect to database
	db, err := connectDatabase(cfg.DatabaseConfig)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Run database migrations
	if err := runMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Initialize repository
	repo := repository.NewPostgresCollaborationRepository(db)

	// Initialize service
	collabService := service.NewCollaborationService(repo)

	// Initialize handler
	handler := handlers.NewCollaborationHandler(collabService)

	// Create gRPC server
	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	// Register service
	collab.RegisterCollaborationServiceServer(grpcServer, handler)

	// Enable reflection for development
	reflection.Register(grpcServer)

	// Start server
	listener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", cfg.GRPCPort, err)
	}

	// Graceful shutdown
	go func() {
		log.Printf("Collaboration service starting on port %s", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve gRPC server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Collaboration service...")
	grpcServer.GracefulStop()
	log.Println("Collaboration service stopped")
}

// connectDatabase establishes database connection
func connectDatabase(cfg config.DatabaseConfig) (*sql.DB, error) {
	dbConfig := database.Config{
		Host:            cfg.Host,
		Port:            cfg.Port,
		User:            cfg.User,
		Password:        cfg.Password,
		Name:            cfg.Name,
		SSLMode:         cfg.SSLMode,
		MaxOpenConns:    cfg.MaxOpenConns,
		MaxIdleConns:    cfg.MaxIdleConns,
		ConnMaxLifetime: cfg.ConnMaxLifetime,
	}

	return database.Connect(&dbConfig)
}

// runMigrations runs database migrations
func runMigrations(db *sql.DB) error {
	// These tables should already exist from the collaboration migrations
	// This is just a safety check to create them if needed

	// Create collaborators table if not exists
	createCollaboratorsTable := `
	CREATE TABLE IF NOT EXISTS collaborators (
		collaborator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL,
		user_id UUID NOT NULL,
		role VARCHAR(50) NOT NULL,
		status VARCHAR(50) NOT NULL DEFAULT 'pending',
		invited_by UUID NOT NULL,
		invited_at TIMESTAMP WITH TIME ZONE NOT NULL,
		joined_at TIMESTAMP WITH TIME ZONE,
		UNIQUE(project_id, user_id)
	);`

	// Create comments table if not exists
	createCommentsTable := `
	CREATE TABLE IF NOT EXISTS comments (
		comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL,
		screenplay_id UUID,
		script_element_id UUID,
		scene_id UUID,
		user_id UUID NOT NULL,
		content TEXT NOT NULL,
		line_number INTEGER,
		char_position INTEGER,
		parent_id UUID REFERENCES comments(comment_id),
		is_resolved BOOLEAN DEFAULT FALSE,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	// Create edit_sessions table if not exists
	createEditSessionsTable := `
	CREATE TABLE IF NOT EXISTS edit_sessions (
		session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL,
		screenplay_id UUID NOT NULL,
		user_id UUID NOT NULL,
		started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		is_active BOOLEAN DEFAULT TRUE
	);`

	// Create edit_operations table if not exists
	createEditOperationsTable := `
	CREATE TABLE IF NOT EXISTS edit_operations (
		operation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		session_id UUID NOT NULL REFERENCES edit_sessions(session_id),
		user_id UUID NOT NULL,
		operation_type VARCHAR(50) NOT NULL,
		position INTEGER NOT NULL,
		content TEXT,
		length INTEGER,
		timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	// Create user_presence table if not exists
	createUserPresenceTable := `
	CREATE TABLE IF NOT EXISTS user_presence (
		presence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id UUID NOT NULL,
		project_id UUID NOT NULL,
		screenplay_id UUID,
		cursor_position INTEGER NOT NULL DEFAULT 0,
		selection_start INTEGER,
		selection_end INTEGER,
		last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		is_online BOOLEAN DEFAULT TRUE,
		UNIQUE(user_id, project_id)
	);`

	// Create indexes
	createIndexes := `
	CREATE INDEX IF NOT EXISTS idx_collaborators_project_id ON collaborators(project_id);
	CREATE INDEX IF NOT EXISTS idx_collaborators_user_id ON collaborators(user_id);
	CREATE INDEX IF NOT EXISTS idx_comments_project_id ON comments(project_id);
	CREATE INDEX IF NOT EXISTS idx_comments_script_element_id ON comments(script_element_id);
	CREATE INDEX IF NOT EXISTS idx_comments_scene_id ON comments(scene_id);
	CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
	CREATE INDEX IF NOT EXISTS idx_edit_sessions_screenplay_id ON edit_sessions(screenplay_id);
	CREATE INDEX IF NOT EXISTS idx_edit_operations_session_id ON edit_operations(session_id);
	CREATE INDEX IF NOT EXISTS idx_user_presence_project_id ON user_presence(project_id);`

	// Execute migrations
	if _, err := db.Exec(createCollaboratorsTable); err != nil {
		return fmt.Errorf("failed to create collaborators table: %w", err)
	}

	if _, err := db.Exec(createCommentsTable); err != nil {
		return fmt.Errorf("failed to create comments table: %w", err)
	}

	if _, err := db.Exec(createEditSessionsTable); err != nil {
		return fmt.Errorf("failed to create edit_sessions table: %w", err)
	}

	if _, err := db.Exec(createEditOperationsTable); err != nil {
		return fmt.Errorf("failed to create edit_operations table: %w", err)
	}

	if _, err := db.Exec(createUserPresenceTable); err != nil {
		return fmt.Errorf("failed to create user_presence table: %w", err)
	}

	if _, err := db.Exec(createIndexes); err != nil {
		return fmt.Errorf("failed to create indexes: %w", err)
	}

	log.Println("Collaboration database migrations completed successfully")
	return nil
}

// loggingInterceptor logs incoming gRPC requests
func loggingInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	log.Printf("gRPC method: %s", info.FullMethod)

	resp, err := handler(ctx, req)
	if err != nil {
		log.Printf("gRPC method: %s, error: %v", info.FullMethod, err)
	}

	return resp, err
}

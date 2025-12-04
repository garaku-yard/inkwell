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

	"scriptlith/server_microservices/internal/scripts/config"
	"scriptlith/server_microservices/internal/scripts/handler"
	"scriptlith/server_microservices/internal/scripts/repository"
	"scriptlith/server_microservices/internal/scripts/service"
	"scriptlith/server_microservices/pkg/database"
	scriptspb "scriptlith/server_microservices/pkg/grpc/scripts"
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
	repo := repository.NewRepository(db)

	// Initialize services
	scriptsService := service.NewScriptsService(repo, cfg)
	beatBoardService := service.NewBeatBoardService(repo)

	// Initialize handler
	scriptsHandler := handler.NewScriptsHandler(scriptsService, beatBoardService)

	// Create gRPC server
	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	// Register service
	scriptspb.RegisterScriptsServiceServer(grpcServer, scriptsHandler)

	// Enable reflection for development
	reflection.Register(grpcServer)

	// Start server
	listener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", cfg.GRPCPort, err)
	}

	// Graceful shutdown
	go func() {
		log.Printf("Scripts service starting on port %s", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve gRPC server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Scripts service...")
	grpcServer.GracefulStop()
	log.Println("Scripts service stopped")
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
	// Create projects table if not exists
	createProjectsTable := `
	CREATE TABLE IF NOT EXISTS projects (
		project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		title VARCHAR(255) NOT NULL,
		description TEXT,
		owner_id UUID NOT NULL,
		status VARCHAR(50) NOT NULL DEFAULT 'draft',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		deleted_at TIMESTAMP WITH TIME ZONE
	);`

	// Create script_elements table if not exists
	createScriptElementsTable := `
	CREATE TABLE IF NOT EXISTS script_elements (
		element_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
		scene_id UUID,
		element_type VARCHAR(50) NOT NULL,
		content TEXT NOT NULL,
		character_id UUID,
		line_number INTEGER NOT NULL DEFAULT 0,
		formatting JSONB DEFAULT '{}',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	// Create scenes table if not exists
	createScenesTable := `
	CREATE TABLE IF NOT EXISTS scenes (
		scene_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
		outline_unit_id UUID,
		scene_heading VARCHAR(255) NOT NULL,
		content TEXT,
		order_index INTEGER NOT NULL DEFAULT 0,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	// Create characters table if not exists
	createCharactersTable := `
	CREATE TABLE IF NOT EXISTS characters (
		character_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
		name VARCHAR(255) NOT NULL,
		description TEXT,
		role VARCHAR(100),
		attributes JSONB DEFAULT '{}',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	// Create locations table if not exists
	createLocationsTable := `
	CREATE TABLE IF NOT EXISTS locations (
		location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
		name VARCHAR(255) NOT NULL,
		description TEXT,
		location_type VARCHAR(50), 
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	// Create outline_units table if not exists
	createOutlineUnitsTable := `
	CREATE TABLE IF NOT EXISTS outline_units (
		outline_unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
		parent_id UUID REFERENCES outline_units(outline_unit_id) ON DELETE CASCADE,
		unit_type VARCHAR(50) NOT NULL,
		title VARCHAR(255) NOT NULL,
		description TEXT,
		color VARCHAR(50),
		tags JSONB DEFAULT '[]',
		icon VARCHAR(100),
		scene_id UUID,
		order_index INTEGER NOT NULL DEFAULT 0,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	// Create indexes
	createIndexes := `
	CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
	CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
	CREATE INDEX IF NOT EXISTS idx_script_elements_project_id ON script_elements(project_id);
	CREATE INDEX IF NOT EXISTS idx_script_elements_line_number ON script_elements(project_id, line_number);
	CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
	CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);
	CREATE INDEX IF NOT EXISTS idx_locations_project_id ON locations(project_id);
	CREATE INDEX IF NOT EXISTS idx_outline_units_project_id ON outline_units(project_id);
	CREATE INDEX IF NOT EXISTS idx_outline_units_parent_id ON outline_units(parent_id);`

	// Execute migrations
	if _, err := db.Exec(createProjectsTable); err != nil {
		return fmt.Errorf("failed to create projects table: %w", err)
	}

	if _, err := db.Exec(createScriptElementsTable); err != nil {
		return fmt.Errorf("failed to create script_elements table: %w", err)
	}

	if _, err := db.Exec(createScenesTable); err != nil {
		return fmt.Errorf("failed to create scenes table: %w", err)
	}

	if _, err := db.Exec(createCharactersTable); err != nil {
		return fmt.Errorf("failed to create characters table: %w", err)
	}

	if _, err := db.Exec(createLocationsTable); err != nil {
		return fmt.Errorf("failed to create locations table: %w", err)
	}

	if _, err := db.Exec(createOutlineUnitsTable); err != nil {
		return fmt.Errorf("failed to create outline_units table: %w", err)
	}

	if _, err := db.Exec(createIndexes); err != nil {
		return fmt.Errorf("failed to create indexes: %w", err)
	}

	// Beat Board tables
	createBeatsTable := `
	CREATE TABLE IF NOT EXISTS beats (
		beat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
		title VARCHAR(255) NOT NULL,
		description TEXT,
		scene_numbers VARCHAR(255),
		color VARCHAR(50),
		position_x INTEGER NOT NULL DEFAULT 0,
		position_y INTEGER NOT NULL DEFAULT 0,
		width INTEGER NOT NULL DEFAULT 200,
		height INTEGER NOT NULL DEFAULT 100,
		act_number INTEGER,
		beat_order INTEGER NOT NULL DEFAULT 0,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	createConnectionsTable := `
	CREATE TABLE IF NOT EXISTS beat_connections (
		connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
		from_beat_id UUID NOT NULL REFERENCES beats(beat_id) ON DELETE CASCADE,
		to_beat_id UUID NOT NULL REFERENCES beats(beat_id) ON DELETE CASCADE,
		from_side VARCHAR(20) NOT NULL,
		to_side VARCHAR(20) NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	createLanesTable := `
	CREATE TABLE IF NOT EXISTS lanes (
		lane_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
		name VARCHAR(255) NOT NULL,
		color VARCHAR(50),
		lane_order INTEGER NOT NULL DEFAULT 0,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	createOutlineItemsTable := `
	CREATE TABLE IF NOT EXISTS outline_items (
		outline_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
		beat_id UUID NOT NULL REFERENCES beats(beat_id) ON DELETE CASCADE,
		lane_id UUID NOT NULL REFERENCES lanes(lane_id) ON DELETE CASCADE,
		item_order INTEGER NOT NULL DEFAULT 0,
		timeline_position DOUBLE PRECISION NOT NULL DEFAULT 0,
		width DOUBLE PRECISION NOT NULL DEFAULT 100,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);`

	createBeatBoardIndexes := `
	CREATE INDEX IF NOT EXISTS idx_beats_project_id ON beats(project_id);
	CREATE INDEX IF NOT EXISTS idx_beats_order ON beats(project_id, beat_order);
	CREATE INDEX IF NOT EXISTS idx_beat_connections_project_id ON beat_connections(project_id);
	CREATE INDEX IF NOT EXISTS idx_beat_connections_from_beat ON beat_connections(from_beat_id);
	CREATE INDEX IF NOT EXISTS idx_beat_connections_to_beat ON beat_connections(to_beat_id);
	CREATE INDEX IF NOT EXISTS idx_lanes_project_id ON lanes(project_id);
	CREATE INDEX IF NOT EXISTS idx_lanes_order ON lanes(project_id, lane_order);
	CREATE INDEX IF NOT EXISTS idx_outline_items_project_id ON outline_items(project_id);
	CREATE INDEX IF NOT EXISTS idx_outline_items_beat_id ON outline_items(beat_id);
	CREATE INDEX IF NOT EXISTS idx_outline_items_lane_id ON outline_items(lane_id);`

	if _, err := db.Exec(createBeatsTable); err != nil {
		return fmt.Errorf("failed to create beats table: %w", err)
	}

	if _, err := db.Exec(createConnectionsTable); err != nil {
		return fmt.Errorf("failed to create beat_connections table: %w", err)
	}

	if _, err := db.Exec(createLanesTable); err != nil {
		return fmt.Errorf("failed to create lanes table: %w", err)
	}

	if _, err := db.Exec(createOutlineItemsTable); err != nil {
		return fmt.Errorf("failed to create outline_items table: %w", err)
	}

	if _, err := db.Exec(createBeatBoardIndexes); err != nil {
		return fmt.Errorf("failed to create beat board indexes: %w", err)
	}

	log.Println("Database migrations completed successfully")
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

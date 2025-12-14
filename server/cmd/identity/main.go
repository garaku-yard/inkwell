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

	"scriptlith/server/internal/identity/config"
	"scriptlith/server/internal/identity/handler"
	"scriptlith/server/internal/identity/repository"
	"scriptlith/server/internal/identity/service"
	"scriptlith/server/pkg/database"
	identitypb "scriptlith/server/pkg/grpc/identity"
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

	// Debug: log database connection info
	log.Printf("Database config: Host=%s, Port=%s, User=%s, Database=%s",
		cfg.DatabaseConfig.Host, cfg.DatabaseConfig.Port,
		cfg.DatabaseConfig.User, cfg.DatabaseConfig.Name)

	// Connect to database
	db, err := connectDatabase(cfg.DatabaseConfig)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := runMigrations(cfg.DatabaseConfig); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Initialize repository
	userRepo := repository.NewUserRepository(db)

	// Initialize service
	authService := service.NewAuthService(userRepo, cfg)

	// Initialize handler
	identityHandler := handler.NewIdentityHandler(authService)

	// Create gRPC server
	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	// Register service
	identitypb.RegisterIdentityServiceServer(grpcServer, identityHandler)

	// Enable reflection for development
	reflection.Register(grpcServer)

	// Start server
	listener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", cfg.GRPCPort, err)
	}

	// Graceful shutdown
	go func() {
		log.Printf("Identity service starting on port %s", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve gRPC server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Identity service...")
	grpcServer.GracefulStop()
	log.Println("Identity service stopped")
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

func runMigrations(cfg config.DatabaseConfig) error {
	// Use standard SQL migrations instead of GORM to avoid parameter mismatch issues
	db, err := connectDatabase(cfg)
	if err != nil {
		return fmt.Errorf("failed to connect for migrations: %w", err)
	}
	defer db.Close()

	migrations := []string{
		// Users table
		`CREATE TABLE IF NOT EXISTS users (
			user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			email VARCHAR(255) UNIQUE NOT NULL,
			username VARCHAR(255) UNIQUE NOT NULL,
			user_tag VARCHAR(10) NOT NULL,
			password_hash TEXT NOT NULL,
			first_name VARCHAR(255),
			last_name VARCHAR(255),
			avatar_url TEXT,
			role VARCHAR(50) DEFAULT 'user',
			is_active BOOLEAN DEFAULT true,
			is_verified BOOLEAN DEFAULT false,
			email_verified BOOLEAN DEFAULT false,
			last_login_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW(),
			deleted_at TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_users_user_tag ON users(user_tag)`,
		`CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at)`,

		// User sessions table
		`CREATE TABLE IF NOT EXISTS user_sessions (
			session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			refresh_token_hash TEXT NOT NULL,
			device_info TEXT,
			ip_address VARCHAR(50),
			expires_at TIMESTAMP NOT NULL,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT NOW(),
			last_used_at TIMESTAMP DEFAULT NOW(),
			revoked_at TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`,

		// Password reset tokens table
		`CREATE TABLE IF NOT EXISTS password_reset_tokens (
			token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			token_hash TEXT NOT NULL,
			expires_at TIMESTAMP NOT NULL,
			used BOOLEAN DEFAULT false,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id)`,

		// Email verification tokens table
		`CREATE TABLE IF NOT EXISTS email_verification_tokens (
			token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			token_hash TEXT NOT NULL,
			expires_at TIMESTAMP NOT NULL,
			used BOOLEAN DEFAULT false,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id)`,
	}

	for _, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
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

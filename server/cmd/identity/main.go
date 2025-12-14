package main

import (
	"context"
	"database/sql"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"scriptlith/server/internal/identity/config"
	"scriptlith/server/internal/identity/domain"
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

	// Run database migrations
	if err := runMigrations(db); err != nil {
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

// runMigrations runs database migrations using GORM
func runMigrations(db *sql.DB) error {
	// Create GORM DB from sql.DB
	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn: db,
	}), &gorm.Config{})
	if err != nil {
		return err
	}

	// Auto-migrate the schema
	if err := gormDB.AutoMigrate(
		&domain.User{},
		&domain.UserSession{},
		&domain.PasswordResetToken{},
		&domain.EmailVerificationToken{},
	); err != nil {
		return err
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

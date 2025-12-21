package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"scriptlith/server/internal/identity/config"
	"scriptlith/server/internal/identity/handler"
	"scriptlith/server/internal/identity/repository"
	"scriptlith/server/internal/identity/service"
	"scriptlith/server/pkg/database"
	"syscall"

	"github.com/joho/godotenv"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	identitypb "scriptlith/server/pkg/grpc/identity"
)

func main() {
	ctx := context.Background()

	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	log.Printf("Database config: Host=%s, Port=%s, User=%s, Database=%s",
		cfg.DatabaseConfig.Host, cfg.DatabaseConfig.Port,
		cfg.DatabaseConfig.User, cfg.DatabaseConfig.Name)

	// Connect using standard database/sql for migrations
	dbConfig := &database.Config{
		Host:            cfg.DatabaseConfig.Host,
		Port:            cfg.DatabaseConfig.Port,
		User:            cfg.DatabaseConfig.User,
		Password:        cfg.DatabaseConfig.Password,
		Name:            cfg.DatabaseConfig.Name,
		SSLMode:         cfg.DatabaseConfig.SSLMode,
		MaxOpenConns:    cfg.DatabaseConfig.MaxOpenConns,
		MaxIdleConns:    cfg.DatabaseConfig.MaxIdleConns,
		ConnMaxLifetime: cfg.DatabaseConfig.ConnMaxLifetime,
	}

	db, err := database.Connect(dbConfig)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Run migrations
	migrationsPath := "internal/identity/migrations"
	log.Printf("Running migrations from: %s", migrationsPath)

	if err := database.RunMigrations(db, migrationsPath); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	log.Println("Database migrations completed successfully")

	// Create repositories (still using database/sql for now)
	// TODO: Refactor repositories to use sqlc-generated queries
	userRepo := repository.NewUserRepository(db)

	authService := service.NewAuthService(userRepo, cfg)

	identityHandler := handler.NewIdentityHandler(authService)

	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	identitypb.RegisterIdentityServiceServer(grpcServer, identityHandler)

	reflection.Register(grpcServer)

	listener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", cfg.GRPCPort, err)
	}

	go func() {
		log.Printf("Identity service starting on port %s", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve gRPC server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Identity service...")
	_ = ctx // suppress unused variable warning
	grpcServer.GracefulStop()
	log.Println("Identity service stopped")
}

func loggingInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	log.Printf("gRPC method: %s", info.FullMethod)

	resp, err := handler(ctx, req)
	if err != nil {
		log.Printf("gRPC method: %s, error: %v", info.FullMethod, err)
	}

	return resp, err
}

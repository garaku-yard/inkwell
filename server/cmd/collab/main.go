package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"scriptlith/server/internal/collab/config"
	"scriptlith/server/internal/collab/handlers"
	"scriptlith/server/internal/collab/repository"
	"scriptlith/server/internal/collab/service"
	"scriptlith/server/pkg/database"
	"scriptlith/server/pkg/grpc/collab"
	"syscall"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Database configuration
	dbConfig := &database.Config{
		Host:            cfg.DatabaseConfig.Host,
		Port:            cfg.DatabaseConfig.Port,
		User:            cfg.DatabaseConfig.User,
		Password:        cfg.DatabaseConfig.Password,
		Name:            cfg.DatabaseConfig.Name,
		SSLMode:         cfg.DatabaseConfig.SSLMode,
		MaxOpenConns:    25,
		MaxIdleConns:    10,
		ConnMaxLifetime: 3600000000000,
	}

	// Connect to database
	db, err := database.Connect(dbConfig)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Run migrations
	migrationsPath := "internal/collab/migrations"
	log.Printf("Running migrations from: %s", migrationsPath)

	if err := database.RunMigrations(db, migrationsPath); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	log.Println("Database migrations completed successfully")

	repo := repository.NewPostgresCollaborationRepository(db)

	collabService := service.NewCollaborationService(repo)

	handler := handlers.NewCollaborationHandler(collabService)

	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	collab.RegisterCollaborationServiceServer(grpcServer, handler)

	reflection.Register(grpcServer)

	listener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", cfg.GRPCPort, err)
	}

	go func() {
		log.Printf("Collaboration service starting on port %s", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve gRPC server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Collaboration service...")
	grpcServer.GracefulStop()
	log.Println("Collaboration service stopped")
}

func loggingInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	log.Printf("gRPC method: %s", info.FullMethod)

	resp, err := handler(ctx, req)
	if err != nil {
		log.Printf("gRPC method: %s, error: %v", info.FullMethod, err)
	}

	return resp, err
}

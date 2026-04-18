package main

import (
	"context"
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

	"inkwell/server/internal/workspace/config"
	"inkwell/server/internal/workspace/handler"
	"inkwell/server/internal/workspace/repository"
	"inkwell/server/internal/workspace/service"
	"inkwell/server/pkg/database"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: could not load .env: %v", err)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	dbCfg := &database.Config{
		Host:     cfg.DatabaseConfig.Host,
		Port:     cfg.DatabaseConfig.Port,
		User:     cfg.DatabaseConfig.User,
		Password: cfg.DatabaseConfig.Password,
		Name:     cfg.DatabaseConfig.Name,
		SSLMode:  cfg.DatabaseConfig.SSLMode,
	}

	db, err := database.Connect(dbCfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := database.RunMigrations(db, "internal/workspace/migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	repo := repository.NewWorkspaceRepository(db)
	svc := service.NewWorkspaceService(repo)
	h := handler.NewWorkspaceHandler(svc)

	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(loggingInterceptor))
	workspacepb.RegisterWorkspaceServiceServer(grpcServer, h)
	reflection.Register(grpcServer)

	listener, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.GRPCPort))
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", cfg.GRPCPort, err)
	}

	go func() {
		log.Printf("Workspace service starting on port %s", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down workspace service...")
	grpcServer.GracefulStop()
	log.Println("Workspace service stopped")
}

func loggingInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	log.Printf("gRPC: %s", info.FullMethod)
	resp, err := handler(ctx, req)
	if err != nil {
		log.Printf("gRPC error [%s]: %v", info.FullMethod, err)
	}
	return resp, err
}

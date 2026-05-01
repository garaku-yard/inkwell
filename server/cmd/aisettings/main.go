// ai-settings is the microservice that owns BYO AI provider rows for the
// hosted build. It stores non-secret config in Postgres and API keys in
// the same row encrypted with AES-256-GCM. Only the gateway is expected
// to dial this service; nothing is exposed over the public HTTP edge
// except via the gateway's own handlers.
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

	"inkwell/server/internal/aisettings/config"
	"inkwell/server/internal/aisettings/handler"
	"inkwell/server/internal/aisettings/repository"
	"inkwell/server/internal/aisettings/service"
	"inkwell/server/pkg/crypto"
	"inkwell/server/pkg/database"
	aisettingspb "inkwell/server/pkg/grpc/aisettings"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: could not load .env: %v", err)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	encKey, err := crypto.KeyFromEnvBase64("AI_ENCRYPTION_KEY")
	if err != nil {
		log.Fatalf("AI_ENCRYPTION_KEY: %v", err)
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

	if err := database.RunMigrations(db, "internal/aisettings/migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	repo := repository.NewPostgresRepository(db)
	svc, err := service.New(repo, encKey)
	if err != nil {
		log.Fatalf("Failed to build service: %v", err)
	}
	h := handler.New(svc)

	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(loggingInterceptor))
	aisettingspb.RegisterAISettingsServiceServer(grpcServer, h)
	reflection.Register(grpcServer)

	listener, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.GRPCPort))
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", cfg.GRPCPort, err)
	}

	go func() {
		log.Printf("AI settings service starting on port %s", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down ai-settings service...")
	grpcServer.GracefulStop()
}

func loggingInterceptor(ctx context.Context, req any, info *grpc.UnaryServerInfo, h grpc.UnaryHandler) (any, error) {
	log.Printf("gRPC: %s", info.FullMethod)
	resp, err := h(ctx, req)
	if err != nil {
		log.Printf("gRPC error [%s]: %v", info.FullMethod, err)
	}
	return resp, err
}

// ai-settings is the microservice that owns BYO AI provider rows for the
// hosted build. It stores non-secret config in Postgres and API keys in
// the same row encrypted with AES-256-GCM. Only the gateway is expected
// to dial this service; nothing is exposed over the public HTTP edge
// except via the gateway's own handlers.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"strconv"
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
	rotateFlag := flag.Bool("rotate", false, "Re-encrypt all rows under the current AI_ENCRYPTION_KEY and exit. Requires AI_ENCRYPTION_KEY_OLD + AI_ENCRYPTION_KEY_OLD_VERSION when migrating away from a prior key.")
	flag.Parse()

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

	// Current key version defaults to 1. Bump via env when rotating
	// (e.g. AI_ENCRYPTION_KEY_VERSION=2 alongside the new key).
	currentVersion := int32(1)
	if v := os.Getenv("AI_ENCRYPTION_KEY_VERSION"); v != "" {
		parsed, perr := strconv.Atoi(v)
		if perr != nil || parsed < 1 {
			log.Fatalf("AI_ENCRYPTION_KEY_VERSION: must be a positive integer, got %q", v)
		}
		currentVersion = int32(parsed)
	}

	// Optional legacy key — present during a rotation window so the
	// service can decrypt rows that haven't been re-encrypted yet.
	var legacy []service.VersionedKey
	if os.Getenv("AI_ENCRYPTION_KEY_OLD") != "" {
		oldKey, err := crypto.KeyFromEnvBase64("AI_ENCRYPTION_KEY_OLD")
		if err != nil {
			log.Fatalf("AI_ENCRYPTION_KEY_OLD: %v", err)
		}
		oldVersionStr := os.Getenv("AI_ENCRYPTION_KEY_OLD_VERSION")
		if oldVersionStr == "" {
			log.Fatal("AI_ENCRYPTION_KEY_OLD_VERSION is required when AI_ENCRYPTION_KEY_OLD is set")
		}
		oldVersion, err := strconv.Atoi(oldVersionStr)
		if err != nil || oldVersion < 1 {
			log.Fatalf("AI_ENCRYPTION_KEY_OLD_VERSION: must be a positive integer, got %q", oldVersionStr)
		}
		legacy = append(legacy, service.VersionedKey{Version: int32(oldVersion), Key: oldKey})
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
	svc, err := service.NewWithRotation(repo, currentVersion, encKey, legacy)
	if err != nil {
		log.Fatalf("Failed to build service: %v", err)
	}

	if *rotateFlag {
		log.Printf("Re-encrypting rows under key version %d (%d legacy key(s) available)", currentVersion, len(legacy))
		count, err := svc.ReencryptAll(context.Background())
		if err != nil {
			log.Fatalf("ReencryptAll failed after %d row(s): %v", count, err)
		}
		log.Printf("Re-encrypted %d row(s); rotation complete. You can now drop AI_ENCRYPTION_KEY_OLD and restart the service.", count)
		return
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

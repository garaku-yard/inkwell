package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"inkwell/server/internal/collab/config"
	"inkwell/server/internal/collab/handlers"
	"inkwell/server/internal/collab/repository"
	"inkwell/server/internal/collab/service"
	"inkwell/server/pkg/database"
	"inkwell/server/pkg/events"
	"inkwell/server/pkg/grpc/collab"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	if err := godotenv.Load(); err != nil {
		slog.Warn("could not load .env file", "error", err)
	}

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

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

	db, err := database.Connect(dbConfig)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := database.RunMigrations(db, "internal/collab/migrations"); err != nil {
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}
	slog.Info("database migrations completed")

	// Event publisher — Kafka in production, noop when brokers are not configured.
	var publisher events.Publisher
	if brokers := cfg.KafkaConfig.Brokers; len(brokers) > 0 && brokers[0] != "" {
		slog.Info("kafka publisher enabled", "brokers", strings.Join(brokers, ","))
		publisher = events.NewKafkaPublisher(brokers)
	} else {
		slog.Warn("kafka brokers not configured, using noop event publisher")
		publisher = &events.NoopPublisher{}
	}

	repo := repository.NewPostgresCollaborationRepository(db)
	collabService := service.NewCollaborationService(repo, publisher)
	handler := handlers.NewCollaborationHandler(collabService)

	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	collab.RegisterCollaborationServiceServer(grpcServer, handler)
	reflection.Register(grpcServer)

	listener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		slog.Error("failed to listen", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	go func() {
		slog.Info("collaboration service starting", "port", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			slog.Error("grpc server failed", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down collaboration service")
	grpcServer.GracefulStop()
	slog.Info("collaboration service stopped")
}

func loggingInterceptor(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
	slog.Info("grpc call", "method", info.FullMethod)
	resp, err := handler(ctx, req)
	if err != nil {
		slog.Error("grpc call failed", "method", info.FullMethod, "error", err)
	}
	return resp, err
}

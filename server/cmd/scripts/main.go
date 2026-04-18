package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"scriptlith/server/internal/scripts/config"
	"scriptlith/server/internal/scripts/handler"
	"scriptlith/server/internal/scripts/repository"
	"scriptlith/server/internal/scripts/service"
	"scriptlith/server/pkg/database"
	"scriptlith/server/pkg/events"
	scriptspb "scriptlith/server/pkg/grpc/scripts"

	"github.com/joho/godotenv"
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
		MaxOpenConns:    cfg.DatabaseConfig.MaxOpenConns,
		MaxIdleConns:    cfg.DatabaseConfig.MaxIdleConns,
		ConnMaxLifetime: cfg.DatabaseConfig.ConnMaxLifetime,
	}

	db, err := database.Connect(dbConfig)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := database.RunMigrations(db, "internal/scripts/migrations"); err != nil {
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}
	slog.Info("database migrations completed")

	// Event publisher — Kafka in production, noop when brokers are not configured.
	var publisher events.Publisher
	if len(cfg.KafkaConfig.Brokers) > 0 && cfg.KafkaConfig.Brokers[0] != "" {
		slog.Info("kafka publisher enabled", "brokers", strings.Join(cfg.KafkaConfig.Brokers, ","))
		publisher = events.NewKafkaPublisher(cfg.KafkaConfig.Brokers)
	} else {
		slog.Warn("kafka brokers not configured, using noop event publisher")
		publisher = &events.NoopPublisher{}
	}

	repo := repository.NewRepository(db)
	scriptsService := service.NewScriptsService(repo, cfg, publisher)
	beatBoardService := service.NewBeatBoardService(repo)
	scriptsHandler := handler.NewScriptsHandler(scriptsService, beatBoardService)

	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	scriptspb.RegisterScriptsServiceServer(grpcServer, scriptsHandler)
	reflection.Register(grpcServer)

	listener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		slog.Error("failed to listen", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	go func() {
		slog.Info("scripts service starting", "port", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			slog.Error("grpc server failed", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down scripts service")
	grpcServer.GracefulStop()
	slog.Info("scripts service stopped")
}

func loggingInterceptor(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
	slog.Info("grpc call", "method", info.FullMethod)
	resp, err := handler(ctx, req)
	if err != nil {
		slog.Error("grpc call failed", "method", info.FullMethod, "error", err)
	}
	return resp, err
}

package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"inkwell/server/internal/identity/config"
	"inkwell/server/internal/identity/handler"
	"inkwell/server/internal/identity/repository"
	"inkwell/server/internal/identity/service"
	"inkwell/server/pkg/database"
	"inkwell/server/pkg/events"
	identitypb "inkwell/server/pkg/grpc/identity"
	"inkwell/server/pkg/outbox"
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

	if err := database.RunMigrations(db, "internal/identity/migrations"); err != nil {
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}
	slog.Info("database migrations completed")

	// Event publisher — Kafka in production, noop when brokers are not configured.
	var publisher events.Publisher
	if b := os.Getenv("KAFKA_BROKERS"); b != "" && strings.TrimSpace(b) != "" {
		brokers := strings.Split(b, ",")
		slog.Info("kafka publisher enabled", "brokers", b)
		kp := events.NewKafkaPublisher(brokers)
		publisher = kp
		defer kp.Close()
	} else {
		slog.Warn("kafka brokers not configured, using noop publisher")
		publisher = &events.NoopPublisher{}
	}

	userRepo := repository.NewUserRepository(db)
	outboxStore := outbox.NewPostgresStore(db, "identity_outbox")
	authService := service.NewAuthService(db, userRepo, cfg, publisher, outboxStore)
	identityHandler := handler.NewIdentityHandler(authService)

	// Outbox poller — flushes unpublished identity events to Kafka every 10 s.
	pollerCtx, cancelPoller := context.WithCancel(context.Background())
	defer cancelPoller()
	poller := outbox.
		NewPoller(outboxStore, publisher, 10*time.Second, 50).
		WithLogger(slog.Default().With("component", "identity_outbox"))
	go poller.Run(pollerCtx)

	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	identitypb.RegisterIdentityServiceServer(grpcServer, identityHandler)
	reflection.Register(grpcServer)

	listener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		slog.Error("failed to listen", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	go func() {
		slog.Info("identity service starting", "port", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			slog.Error("grpc server failed", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down identity service")
	cancelPoller()
	poller.Wait()
	grpcServer.GracefulStop()
	slog.Info("identity service stopped")
}

func loggingInterceptor(ctx context.Context, req any, info *grpc.UnaryServerInfo, h grpc.UnaryHandler) (any, error) {
	slog.Info("grpc call", "method", info.FullMethod)
	resp, err := h(ctx, req)
	if err != nil {
		slog.Error("grpc call failed", "method", info.FullMethod, "error", err)
	}
	return resp, err
}

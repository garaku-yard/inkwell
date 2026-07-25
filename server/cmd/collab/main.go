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

	"inkwell/server/internal/collab/config"
	"inkwell/server/internal/collab/handlers"
	"inkwell/server/internal/collab/repository"
	"inkwell/server/internal/collab/service"
	"inkwell/server/pkg/database"
	"inkwell/server/pkg/events"
	"inkwell/server/pkg/grpc/collab"
	"inkwell/server/pkg/grpclimits"
	"inkwell/server/pkg/outbox"

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
	outboxStore := outbox.NewPostgresStore(db, "collab_outbox")
	collabService := service.NewCollaborationService(db, repo, publisher, outboxStore)
	handler := handlers.NewCollaborationHandler(collabService)

	// Outbox poller — flushes unpublished collab events to Kafka every 10 s.
	pollerCtx, cancelPoller := context.WithCancel(context.Background())
	defer cancelPoller()
	poller := outbox.
		NewPoller(outboxStore, publisher, 10*time.Second, 50).
		WithLogger(slog.Default().With("component", "collab_outbox"))
	go poller.Run(pollerCtx)

	// Stale edit-session sweeper — closes durable advisory locks abandoned
	// without a clean disconnect (crashed client / killed gateway). Reads
	// already ignore stale rows via the staleness cutoff; this just keeps the
	// active set from growing unbounded.
	go runEditSessionSweeper(pollerCtx, collabService)

	grpcServer := grpc.NewServer(append(
		grpclimits.ServerOptions(),
		grpc.UnaryInterceptor(loggingInterceptor),
	)...)

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
	cancelPoller()
	poller.Wait()
	grpcServer.GracefulStop()
	slog.Info("collaboration service stopped")
}

// runEditSessionSweeper periodically closes edit sessions abandoned without a
// clean disconnect, until ctx is cancelled. Failures are logged and retried on
// the next tick — the sweep is best-effort hygiene, never critical path.
func runEditSessionSweeper(ctx context.Context, svc *service.CollaborationService) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sweepCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			closed, err := svc.SweepStaleEditSessions(sweepCtx)
			cancel()
			if err != nil {
				slog.Warn("edit-session sweep failed", "error", err)
				continue
			}
			if closed > 0 {
				slog.Info("closed stale edit sessions", "count", closed)
			}
		}
	}
}

func loggingInterceptor(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
	slog.Info("grpc call", "method", info.FullMethod)
	resp, err := handler(ctx, req)
	if err != nil {
		slog.Error("grpc call failed", "method", info.FullMethod, "error", err)
	}
	return resp, err
}

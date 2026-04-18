package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"scriptlith/server/internal/billing/config"
	"scriptlith/server/internal/billing/handler"
	"scriptlith/server/internal/billing/repository"
	"scriptlith/server/internal/billing/service"
	"scriptlith/server/pkg/database"
	"scriptlith/server/pkg/events"
	billingpb "scriptlith/server/pkg/grpc/billing"

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

	dbCfg := &database.Config{
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

	db, err := database.Connect(dbCfg)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := database.RunMigrations(db, "internal/billing/migrations"); err != nil {
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}
	slog.Info("database migrations completed")

	// Event publisher — Kafka in production, noop when brokers are not configured.
	var publisher events.Publisher
	if len(cfg.KafkaConfig.Brokers) > 0 && cfg.KafkaConfig.Brokers[0] != "" {
		slog.Info("kafka publisher enabled", "brokers", strings.Join(cfg.KafkaConfig.Brokers, ","))
		kp := events.NewKafkaPublisher(cfg.KafkaConfig.Brokers)
		publisher = kp
		defer kp.Close()
	} else {
		slog.Warn("kafka brokers not configured, using noop publisher")
		publisher = &events.NoopPublisher{}
	}

	repo := repository.NewPostgresRepository(db)
	svc := service.NewBillingService(repo, publisher)
	billingHandler := handler.NewBillingHandler(svc)

	// Outbox poller — flushes unpublished billing events to Kafka every 10 s.
	pollerCtx, cancelPoller := context.WithCancel(context.Background())
	go runOutboxPoller(pollerCtx, repo, publisher)

	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	billingpb.RegisterBillingServiceServer(grpcServer, billingHandler)
	reflection.Register(grpcServer)

	listener, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		slog.Error("failed to listen", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	go func() {
		slog.Info("billing service starting", "port", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			slog.Error("grpc server failed", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down billing service")
	cancelPoller()
	grpcServer.GracefulStop()
	slog.Info("billing service stopped")
}

// runOutboxPoller polls billing_outbox every 10 s and publishes pending events to Kafka.
// This gives reliable at-least-once delivery for billing events even if an in-process
// Publish call fails at the moment of the subscription change.
func runOutboxPoller(ctx context.Context, repo repository.BillingRepository, pub events.Publisher) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pending, err := repo.ListUnpublishedOutboxEvents(ctx, 50)
			if err != nil {
				slog.Warn("outbox poller: failed to list events", "error", err)
				continue
			}
			for _, e := range pending {
				var payload json.RawMessage = e.Payload
				if err := pub.Publish(ctx, e.EventType, payload); err != nil {
					slog.Warn("outbox poller: failed to publish event", "id", e.ID, "error", err)
					continue
				}
				if err := repo.MarkOutboxEventPublished(ctx, e.ID); err != nil {
					slog.Warn("outbox poller: failed to mark event published", "id", e.ID, "error", err)
				}
			}
		}
	}
}

func loggingInterceptor(ctx context.Context, req any, info *grpc.UnaryServerInfo, h grpc.UnaryHandler) (any, error) {
	slog.Info("grpc call", "method", info.FullMethod)
	resp, err := h(ctx, req)
	if err != nil {
		slog.Error("grpc call failed", "method", info.FullMethod, "error", err)
	}
	return resp, err
}

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

	"inkwell/server/internal/billing/config"
	"inkwell/server/internal/billing/handler"
	"inkwell/server/internal/billing/repository"
	"inkwell/server/internal/billing/service"
	"inkwell/server/pkg/database"
	"inkwell/server/pkg/events"
	billingpb "inkwell/server/pkg/grpc/billing"
	"inkwell/server/pkg/grpclimits"
	"inkwell/server/pkg/grpcmeta"
	"inkwell/server/pkg/outbox"
	"inkwell/server/pkg/paddle"
	redisclient "inkwell/server/pkg/redis"

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

	// Payment gateway (Paddle). Inert until PADDLE_API_KEY is set — Checkout
	// stays nil and WebhookSecret empty, so checkout/webhook calls fail closed.
	payment := service.PaymentConfig{
		WebhookSecret: cfg.PaddleConfig.WebhookSecret,
		PriceMap:      cfg.PaddleConfig.PriceMap,
	}
	if cfg.PaddleConfig.Configured() {
		paddleClient := paddle.New(cfg.PaddleConfig.APIKey, cfg.PaddleConfig.Environment)
		payment.Checkout = paddleClient
		payment.Updater = paddleClient
		slog.Info("paddle payment gateway enabled", "environment", cfg.PaddleConfig.Environment)
	} else {
		slog.Warn("paddle not configured (PADDLE_API_KEY unset) — checkout disabled")
	}

	// Redis backs the live monthly usage counters (managed-AI metering) so the
	// hot path stays off the database. Optional — without it, usage falls back to
	// summing usage_events directly.
	var rdb *redisclient.Client
	if cfg.RedisConfig.Host != "" {
		rdb, err = redisclient.New(redisclient.Config{
			Host:     cfg.RedisConfig.Host,
			Port:     cfg.RedisConfig.Port,
			Password: cfg.RedisConfig.Password,
		})
		if err != nil {
			slog.Warn("redis unavailable — usage metering falls back to direct DB sums", "error", err)
			rdb = nil
		} else {
			slog.Info("redis usage counters enabled")
			defer rdb.Close()
		}
	}

	repo := repository.NewPostgresRepository(db)
	outboxStore := outbox.NewPostgresStore(db, "billing_outbox")
	svc := service.NewBillingService(db, repo, outboxStore, publisher, payment, rdb)
	billingHandler := handler.NewBillingHandler(svc)

	// Outbox poller — flushes unpublished billing events to Kafka every 10 s.
	// Batch size of 50 mirrors the previous inline poller.
	pollerCtx, cancelPoller := context.WithCancel(context.Background())
	poller := outbox.
		NewPoller(outboxStore, publisher, 10*time.Second, 50).
		WithLogger(slog.Default().With("component", "billing_outbox"))
	go poller.Run(pollerCtx)

	// Drain buffered usage events to the durable log off the request path.
	go svc.RunUsageFlusher(pollerCtx)

	grpcServer := grpc.NewServer(append(
		grpclimits.ServerOptions(),
		grpc.UnaryInterceptor(grpcmeta.ServerInterceptor("billing")),
	)...)

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
	poller.Wait()
	grpcServer.GracefulStop()
	slog.Info("billing service stopped")
}

func loggingInterceptor(ctx context.Context, req any, info *grpc.UnaryServerInfo, h grpc.UnaryHandler) (any, error) {
	slog.Info("grpc call", "method", info.FullMethod)
	resp, err := h(ctx, req)
	if err != nil {
		slog.Error("grpc call failed", "method", info.FullMethod, "error", err)
	}
	return resp, err
}

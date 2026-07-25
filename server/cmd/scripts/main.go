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

	"inkwell/server/internal/scripts/config"
	"inkwell/server/internal/scripts/handler"
	"inkwell/server/internal/scripts/repository"
	"inkwell/server/internal/scripts/service"
	"inkwell/server/pkg/database"
	"inkwell/server/pkg/events"
	billingpb "inkwell/server/pkg/grpc/billing"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	"inkwell/server/pkg/grpclimits"
	"inkwell/server/pkg/outbox"
	"inkwell/server/pkg/quota"
	"inkwell/server/pkg/quota/billingadapter"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
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
	outboxStore := outbox.NewPostgresStore(db, "scripts_outbox")

	// Billing client — used for quota enforcement (projects per tier) and usage
	// reporting. Connection failures are logged and enforcement is disabled so
	// the scripts service can boot even when billing is down.
	var quotaClient quota.Client
	billingAddr := cfg.BillingConfig.Host + ":" + cfg.BillingConfig.Port
	billingConn, err := grpc.NewClient(billingAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		slog.Warn("billing client unavailable, quota enforcement disabled", "address", billingAddr, "error", err)
	} else {
		defer billingConn.Close()
		quotaClient = billingadapter.New(billingpb.NewBillingServiceClient(billingConn))
	}

	scriptsService := service.NewScriptsService(db, repo, outboxStore, cfg, publisher, quotaClient)
	beatBoardService := service.NewBeatBoardService(repo)
	scriptsHandler := handler.NewScriptsHandler(scriptsService, beatBoardService)

	// Outbox poller — flushes unpublished scripts events to Kafka every 10 s.
	pollerCtx, cancelPoller := context.WithCancel(context.Background())
	defer cancelPoller()
	poller := outbox.
		NewPoller(outboxStore, publisher, 10*time.Second, 50).
		WithLogger(slog.Default().With("component", "scripts_outbox"))
	go poller.Run(pollerCtx)

	// Tombstone GC — periodically hard-delete soft-deleted rows past the
	// retention horizon (time-based, no device tracking; mirrors the client's
	// per-sync purge). Runs once at startup, then daily.
	syncRepo := repository.NewSyncRepository(db)
	go func() {
		const retention = 90 * 24 * time.Hour
		runGC := func() {
			ctx, cancel := context.WithTimeout(pollerCtx, 2*time.Minute)
			defer cancel()
			if n, err := syncRepo.PurgeTombstones(ctx, retention); err != nil {
				slog.Warn("tombstone GC failed", "error", err)
			} else if n > 0 {
				slog.Info("tombstone GC purged rows", "count", n)
			}
			if n, err := syncRepo.PurgeVaultTombstones(ctx, retention); err != nil {
				slog.Warn("vault tombstone GC failed", "error", err)
			} else if n > 0 {
				slog.Info("vault tombstone GC purged files", "count", n)
			}
		}
		runGC()
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-pollerCtx.Done():
				return
			case <-ticker.C:
				runGC()
			}
		}
	}()

	grpcServer := grpc.NewServer(append(
		grpclimits.ServerOptions(),
		grpc.UnaryInterceptor(loggingInterceptor),
	)...)

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
	cancelPoller()
	poller.Wait()
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

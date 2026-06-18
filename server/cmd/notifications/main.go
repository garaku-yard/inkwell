package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"inkwell/server/internal/notifications/config"
	"inkwell/server/internal/notifications/consumer"
	"inkwell/server/internal/notifications/handler"
	"inkwell/server/internal/notifications/repository"
	"inkwell/server/internal/notifications/service"
	"inkwell/server/pkg/database"
	notificationspb "inkwell/server/pkg/grpc/notifications"
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

	if err := database.RunMigrations(db, "internal/notifications/migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	repo := repository.NewNotificationRepository(db)
	svc := service.NewNotificationService(repo)
	h := handler.NewNotificationHandler(svc)

	// Kafka consumer — the source of in-app notifications. Enabled only when
	// brokers are configured; without it the service still serves preferences
	// and the (empty) feed, which is the local/dev default.
	consumerCtx, cancelConsumer := context.WithCancel(context.Background())
	defer cancelConsumer()
	var cons *consumer.Consumer
	if b := strings.TrimSpace(os.Getenv("KAFKA_BROKERS")); b != "" {
		brokers := strings.Split(b, ",")
		// Subscribe to the families we deliver on. collaboration.added lives on
		// collab-events; later phases add more topics here.
		cons = consumer.New(brokers, []string{"collab-events"}, "notifications-service", svc)
		go cons.Run(consumerCtx)
		log.Printf("Kafka consumer enabled (brokers=%s)", b)
	} else {
		log.Println("KAFKA_BROKERS not set — in-app delivery disabled (preferences still served)")
	}

	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(loggingInterceptor))
	notificationspb.RegisterNotificationsServiceServer(grpcServer, h)
	reflection.Register(grpcServer)

	listener, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.GRPCPort))
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", cfg.GRPCPort, err)
	}

	go func() {
		log.Printf("Notifications service starting on port %s", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down notifications service...")
	cancelConsumer()
	if cons != nil {
		_ = cons.Close()
	}
	grpcServer.GracefulStop()
	log.Println("Notifications service stopped")
}

func loggingInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	log.Printf("gRPC: %s", info.FullMethod)
	resp, err := handler(ctx, req)
	if err != nil {
		log.Printf("gRPC error [%s]: %v", info.FullMethod, err)
	}
	return resp, err
}

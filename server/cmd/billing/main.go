package main

import (
	"database/sql"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"scriptlith/server/pkg/database"
	billingpb "scriptlith/server/pkg/grpc/billing"
)

type billingServer struct {
	billingpb.UnimplementedBillingServiceServer
	db *sql.DB
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	port := os.Getenv("GRPC_PORT")
	if port == "" {
		port = "50054"
	}

	// Database configuration
	dbConfig := &database.Config{
		Host:            os.Getenv("BILLING_DB_HOST"),
		Port:            os.Getenv("BILLING_DB_PORT"),
		User:            os.Getenv("BILLING_DB_USER"),
		Password:        os.Getenv("BILLING_DB_PASSWORD"),
		Name:            os.Getenv("BILLING_DB_NAME"),
		SSLMode:         os.Getenv("BILLING_DB_SSLMODE"),
		MaxOpenConns:    25,
		MaxIdleConns:    10,
		ConnMaxLifetime: 3600000000000,
	}

	// Connect to database
	db, err := database.Connect(dbConfig)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Run migrations
	migrationsPath := "internal/billing/migrations"
	log.Printf("Running migrations from: %s", migrationsPath)

	if err := database.RunMigrations(db, migrationsPath); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	log.Println("Database migrations completed successfully")

	grpcServer := grpc.NewServer()

	billingpb.RegisterBillingServiceServer(grpcServer, &billingServer{db: db})

	reflection.Register(grpcServer)

	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", port, err)
	}

	go func() {
		log.Printf("Billing service starting on port %s", port)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve gRPC server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Billing service...")
	grpcServer.GracefulStop()
	log.Println("Billing service stopped")
}

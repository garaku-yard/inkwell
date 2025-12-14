package main

import (
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	billingpb "scriptlith/server/pkg/grpc/billing"
)

// Minimal billing service implementation
type billingServer struct {
	billingpb.UnimplementedBillingServiceServer
}

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	// Get port from environment or use default
	port := os.Getenv("GRPC_PORT")
	if port == "" {
		port = "50054"
	}

	// Create gRPC server
	grpcServer := grpc.NewServer()

	// Register billing service
	billingpb.RegisterBillingServiceServer(grpcServer, &billingServer{})

	// Enable reflection for development
	reflection.Register(grpcServer)

	// Start server
	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", port, err)
	}

	// Graceful shutdown
	go func() {
		log.Printf("Billing service starting on port %s", port)
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve gRPC server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Billing service...")
	grpcServer.GracefulStop()
	log.Println("Billing service stopped")
}

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

type billingServer struct {
	billingpb.UnimplementedBillingServiceServer
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	port := os.Getenv("GRPC_PORT")
	if port == "" {
		port = "50054"
	}

	grpcServer := grpc.NewServer()

	billingpb.RegisterBillingServiceServer(grpcServer, &billingServer{})

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

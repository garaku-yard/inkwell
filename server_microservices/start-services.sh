#!/bin/bash

# Script to start all microservices for Scriptlith
# Run this from the server_microservices directory
# Make sure you have a .env file with your database credentials

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found!"
    echo "Please copy .env.example to .env and configure your database credentials"
    echo "Example: cp .env.example .env"
    echo "Then edit .env with your database passwords"
    exit 1
fi

echo "Loading environment from .env file..."

# Start Identity Service (port 50051)
echo "Starting Identity Service on port 50051..."
./bin/scriptlith-identity &
IDENTITY_PID=$!

# Start Scripts Service (port 50052)
echo "Starting Scripts Service on port 50052..."
./bin/scriptlith-scripts &
SCRIPTS_PID=$!

# Start Collaboration Service (port 50053)
echo "Starting Collaboration Service on port 50053..."
./bin/scriptlith-collab &
COLLAB_PID=$!

# Give services time to start
sleep 2

# Start API Gateway (port 8080)
echo "Starting API Gateway on port 8080..."
./bin/scriptlith-gateway &
GATEWAY_PID=$!

echo "All services started:"
echo "- Identity Service: PID $IDENTITY_PID (port 50051)"
echo "- Scripts Service: PID $SCRIPTS_PID (port 50052)"
echo "- Collaboration Service: PID $COLLAB_PID (port 50053)"
echo "- API Gateway: PID $GATEWAY_PID (port 8080)"
echo
echo "API Gateway health check: http://localhost:8080/health"
echo "Press Ctrl+C to stop all services"

# Function to cleanup processes on exit
cleanup() {
    echo
    echo "Stopping all services..."
    kill $IDENTITY_PID $SCRIPTS_PID $COLLAB_PID $GATEWAY_PID 2>/dev/null
    wait
    echo "All services stopped"
    exit 0
}

# Set trap to cleanup on exit
trap cleanup SIGINT SIGTERM

# Wait for all background processes
wait
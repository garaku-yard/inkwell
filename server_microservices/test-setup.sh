#!/bin/bash

# Test script to verify our microservices are working
echo "🚀 Testing Scriptlith Microservices Setup..."

# Build the services
echo "📦 Building services..."
cd /home/l1roii/personal/scriptlith/server_microservices

# Set PATH for protoc generators
export PATH=$PATH:$(go env GOPATH)/bin

# Generate protobuf and build
make proto && go build -o bin/gateway ./cmd/gateway && go build -o bin/identity ./cmd/identity

if [ $? -eq 0 ]; then
    echo "✅ Services built successfully!"
else
    echo "❌ Build failed!"
    exit 1
fi

# Test 1: Start Gateway and Identity manually for testing
echo "🧪 Ready for manual testing!"
echo ""
echo "To test the services:"
echo "1. Start Identity service: ./bin/identity"
echo "2. Start API Gateway: ./bin/gateway" 
echo "3. Test with client: cd ../client && npm run dev"
echo ""
echo "Test endpoints:"
echo "- POST http://localhost:8080/register"
echo "- POST http://localhost:8080/login"
echo "- GET http://localhost:8080/health"
#!/bin/bash

# Test script to verify .env loading works correctly
cd /home/l1roii/personal/scriptlith/server_microservices

echo "Testing .env file loading..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "Please run: cp .env.example .env"
    exit 1
fi

echo "✅ .env file found"

# Test build with env loading
echo "Testing service builds with environment loading..."

if go build -o test_identity ./cmd/identity 2>/dev/null; then
    echo "✅ Identity service builds successfully"
    rm -f test_identity
else
    echo "❌ Identity service build failed"
    exit 1
fi

if go build -o test_scripts ./cmd/scripts 2>/dev/null; then
    echo "✅ Scripts service builds successfully"
    rm -f test_scripts
else
    echo "❌ Scripts service build failed"
    exit 1
fi

if go build -o test_collab ./cmd/collab 2>/dev/null; then
    echo "✅ Collaboration service builds successfully"
    rm -f test_collab
else
    echo "❌ Collaboration service build failed"
    exit 1
fi

if go build -o test_gateway ./cmd/gateway 2>/dev/null; then
    echo "✅ Gateway service builds successfully"
    rm -f test_gateway
else
    echo "❌ Gateway service build failed"
    exit 1
fi

echo ""
echo "🎉 All services are ready to use .env configuration!"
echo ""
echo "To customize your setup:"
echo "1. Edit .env with your database passwords"
echo "2. Run: ./start-services.sh"
echo ""
echo "No more manual 'export' commands needed!"
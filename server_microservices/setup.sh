#!/bin/bash

# Complete Setup Script for Scriptlith Microservices
# This script sets up everything needed to run the services

set -e

echo "🚀 Scriptlith Microservices Setup"
echo "=================================="

# Check if PostgreSQL is running
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed or not in PATH"
    echo "Please install PostgreSQL first:"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql postgresql-client"
    echo "  macOS: brew install postgresql"
    echo "  Arch: sudo pacman -S postgresql"
    exit 1
fi

# Check PostgreSQL connection
echo "🔍 Checking PostgreSQL connection..."
read -p "Enter PostgreSQL password for user 'postgres' (or press Enter for empty): " -s POSTGRES_PASSWORD
echo ""

export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-""}

# Test connection
if ! PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U postgres -c "SELECT 1;" &>/dev/null; then
    echo "❌ Cannot connect to PostgreSQL. Please check:"
    echo "  1. PostgreSQL is running: sudo systemctl start postgresql"
    echo "  2. User 'postgres' exists and password is correct"
    echo "  3. PostgreSQL is accepting connections on localhost:5432"
    exit 1
fi

echo "✅ PostgreSQL connection successful"

# Run migrations
echo "📊 Setting up databases..."
./migrate.sh

# Build services
echo "🔨 Building services..."
make build

# Create environment file
echo "⚙️  Creating environment configuration..."
cat > .env << EOF
# Database Configuration for Identity Service
IDENTITY_DB_HOST=localhost
IDENTITY_DB_PORT=5432
IDENTITY_DB_USER=postgres
IDENTITY_DB_PASSWORD=$POSTGRES_PASSWORD
IDENTITY_DB_NAME=identity_db
IDENTITY_DB_SSLMODE=disable

# JWT Configuration
JWT_ACCESS_SECRET=dev-super-secret-access-key-change-in-production
JWT_REFRESH_SECRET=dev-super-secret-refresh-key-change-in-production

# Server Configuration
GRPC_PORT=50051

# Gateway Configuration
GATEWAY_PORT=8080
GATEWAY_IDENTITY_SERVICE_URL=localhost:50051
EOF

echo "✅ Setup complete!"
echo ""
echo "🎯 Quick Start:"
echo "  1. Start Identity Service: ./bin/identity"
echo "  2. Start API Gateway:      ./bin/gateway"  
echo "  3. Start Client:           cd ../client && npm run dev"
echo ""
echo "🔧 Environment variables are set in .env file"
echo "📊 Databases created: identity_db, scripts_db, collaboration_db"
echo ""
echo "Test the API:"
echo "  curl -X POST http://localhost:8080/register -H \"Content-Type: application/json\" -d '{\"email\":\"test@test.com\",\"username\":\"testuser\",\"password\":\"testpass123\"}'"
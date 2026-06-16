# Inkwell Microservices Makefile
.PHONY: proto proto-clean build build-all run-dev stop-dev clean test migrate-up migrate-down

# Variables
PROTO_DIR = proto
PROTO_OUT_DIR = pkg/grpc
GO_MODULE = inkwell/server

# Default target
all: proto build-all

# Generate protobuf files
proto:
	@echo "Generating protobuf files..."
	@mkdir -p $(PROTO_OUT_DIR)
	@# Generate Go files for all proto files
	@find $(PROTO_DIR) -name "*.proto" -exec protoc \
		--go_out=$(PROTO_OUT_DIR) \
		--go_opt=paths=source_relative \
		--go-grpc_out=$(PROTO_OUT_DIR) \
		--go-grpc_opt=paths=source_relative \
		--proto_path=$(PROTO_DIR) \
		{} \;
	@echo "✅ Protobuf generation complete"

# Clean generated protobuf files
proto-clean:
	@echo "Cleaning generated protobuf files..."
	@rm -rf $(PROTO_OUT_DIR)
	@echo "✅ Protobuf files cleaned"

# Install protobuf dependencies
proto-deps:
	@echo "Installing protobuf dependencies..."
	@go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	@go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
	@# Install grpc-health-probe for health checks
	@go install github.com/grpc-ecosystem/grpc-health-probe@latest
	@echo "✅ Protobuf dependencies installed"

# Build all services
build-all: proto
	@echo "Building all services..."
	@go build -o bin/inkwell-gateway ./cmd/gateway
	@go build -o bin/inkwell-identity ./cmd/identity
	@go build -o bin/inkwell-scripts ./cmd/scripts
	@go build -o bin/inkwell-collab ./cmd/collab
	@go build -o bin/inkwell-billing ./cmd/billing
	@go build -o bin/inkwell-workspace ./cmd/workspace
	@echo "✅ All services built successfully"

# Build specific service
build-gateway: proto
	@go build -o bin/inkwell-gateway ./cmd/gateway

build-identity: proto
	@go build -o bin/inkwell-identity ./cmd/identity

build-scripts: proto
	@go build -o bin/inkwell-scripts ./cmd/scripts

build-collab: proto
	@go build -o bin/inkwell-collab ./cmd/collab

build-billing: proto
	@go build -o bin/inkwell-billing ./cmd/billing

build-workspace: proto
	@go build -o bin/inkwell-workspace ./cmd/workspace

# Development environment
run-dev:
	@echo "Starting development environment..."
	@docker-compose -f deploy/dev/docker-compose.yml up --build -d
	@echo "✅ Development environment started"
	@echo "API Gateway: http://localhost:8080"
	@echo "Identity Service: localhost:50051"
	@echo "Scripts Service: localhost:50052"
	@echo "Collaboration Service: localhost:50053"
	@echo "Billing Service: localhost:50054"
	@echo "Workspace Service: localhost:50056"
	@echo "AI Settings Service: localhost:50057"

# Stop development environment
stop-dev:
	@echo "Stopping development environment..."
	@docker-compose -f deploy/dev/docker-compose.yml down
	@echo "✅ Development environment stopped"

# View logs
logs:
	@docker-compose -f deploy/dev/docker-compose.yml logs -f

logs-gateway:
	@docker-compose -f deploy/dev/docker-compose.yml logs -f api-gateway

logs-identity:
	@docker-compose -f deploy/dev/docker-compose.yml logs -f identity-service

logs-scripts:
	@docker-compose -f deploy/dev/docker-compose.yml logs -f scripts-service

logs-collab:
	@docker-compose -f deploy/dev/docker-compose.yml logs -f collab-service

logs-billing:
	@docker-compose -f deploy/dev/docker-compose.yml logs -f billing-service

# Database migrations
migrate-up-identity:
	@echo "Running Identity service migrations..."
	@docker-compose -f deploy/dev/docker-compose.yml exec postgres-identity psql -U postgres -d identity_db -f /docker-entrypoint-initdb.d/001_create_identity_tables.sql
	@echo "✅ Identity migrations complete"

migrate-up-scripts:
	@echo "Running Scripts service migrations..."
	@docker-compose -f deploy/dev/docker-compose.yml exec postgres-scripts psql -U postgres -d scripts_db -f /docker-entrypoint-initdb.d/001_create_scripts_tables.sql
	@echo "✅ Scripts migrations complete"

migrate-up-collab:
	@echo "Running Collaboration service migrations..."
	@docker-compose -f deploy/dev/docker-compose.yml exec postgres-collab psql -U postgres -d collab_db -f /docker-entrypoint-initdb.d/001_create_collaboration_tables.sql
	@echo "✅ Collaboration migrations complete"

migrate-up-billing:
	@echo "Running Billing service migrations..."
	@docker-compose -f deploy/dev/docker-compose.yml exec postgres-billing psql -U postgres -d billing_db -f /docker-entrypoint-initdb.d/001_create_billing_tables.sql
	@echo "✅ Billing migrations complete"

migrate-up-all: migrate-up-identity migrate-up-scripts migrate-up-collab migrate-up-billing

# Testing
test:
	@echo "Running tests..."
	@go test -v ./...

test-coverage:
	@echo "Running tests with coverage..."
	@go test -v -coverprofile=coverage.out ./...
	@go tool cover -html=coverage.out -o coverage.html
	@echo "✅ Coverage report generated: coverage.html"

# Linting and formatting
fmt:
	@echo "Formatting code..."
	@go fmt ./...
	@echo "✅ Code formatted"

lint:
	@echo "Running linter..."
	@golangci-lint run
	@echo "✅ Linting complete"

# Dependency management
deps:
	@echo "Downloading dependencies..."
	@go mod download
	@go mod tidy
	@echo "✅ Dependencies updated"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf bin/
	@rm -f coverage.out coverage.html
	@docker-compose -f deploy/dev/docker-compose.yml down -v
	@echo "✅ Cleanup complete"

# Development setup
dev-setup: proto-deps deps proto
	@echo "Setting up development environment..."
	@mkdir -p bin
	@echo "✅ Development setup complete"

# Help
help:
	@echo "Inkwell Microservices Development Commands:"
	@echo ""
	@echo "🏗️  Building:"
	@echo "  make build-all        Build all services"
	@echo "  make build-gateway    Build API Gateway"
	@echo "  make build-identity   Build Identity Service"
	@echo "  make build-scripts    Build Scripts Service"
	@echo "  make build-collab     Build Collaboration Service"
	@echo "  make build-billing    Build Billing Service"
	@echo ""
	@echo "🚀 Development:"
	@echo "  make run-dev          Start development environment"
	@echo "  make stop-dev         Stop development environment"
	@echo "  make logs             View all service logs"
	@echo "  make logs-<service>   View specific service logs"
	@echo ""
	@echo "🗄️  Database:"
	@echo "  make migrate-up-all   Run all database migrations"
	@echo "  make migrate-up-<service> Run specific service migrations"
	@echo ""
	@echo "🔧 Protobuf:"
	@echo "  make proto            Generate protobuf files"
	@echo "  make proto-clean      Clean generated protobuf files"
	@echo "  make proto-deps       Install protobuf dependencies"
	@echo ""
	@echo "🧪 Testing:"
	@echo "  make test             Run tests"
	@echo "  make test-coverage    Run tests with coverage"
	@echo ""
	@echo "🔍 Code Quality:"
	@echo "  make fmt              Format code"
	@echo "  make lint             Run linter"
	@echo ""
	@echo "🛠️  Utilities:"
	@echo "  make deps             Update dependencies"
	@echo "  make clean            Clean all build artifacts"
	@echo "  make dev-setup        Initial development setup"
	@echo "  make help             Show this help message"
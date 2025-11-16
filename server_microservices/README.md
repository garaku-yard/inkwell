# Scriptlith Microservices

A modern microservices architecture for collaborative screenplay writing, built with Go, gRPC, and event-driven design.

## 🏗️ Architecture Overview

Scriptlith is built using a microservices architecture with the following components:

### Core Services
- **API Gateway** (Port 8080) - REST/JSON API gateway with gRPC backend communication
- **Identity Service** (Port 50051) - User authentication, authorization, and profile management
- **Scripts Service** (Port 50052) - Project management, screenplays, scenes, characters, and outline units
- **Collaboration Service** (Port 50053) - Real-time editing, comments, and user presence
- **Billing Service** (Port 50054) - Subscriptions, payments, and usage tracking
- **AI Service** (Port 50055) - Content generation, analysis, and screenplay improvements

### Infrastructure
- **PostgreSQL** - Separate databases for each service
- **Redis** - Caching and session management
- **Kafka** - Event streaming between services
- **Docker** - Containerization and local development

## 📁 Project Structure

```
server_microservices/
├── cmd/                          # Deployable binaries
│   ├── api-gateway/              # API Gateway main
│   ├── identity/                 # Identity Service main
│   ├── scripts/                  # Scripts Service main
│   ├── collab/                   # Collaboration Service main
│   └── billing/                  # Billing Service main
│
├── internal/                     # Service-specific private code
│   ├── identity/                 # Identity service implementation
│   ├── scripts/                  # Scripts service implementation
│   ├── collab/                   # Collaboration service implementation
│   └── billing/                  # Billing service implementation
│
├── pkg/                          # Shared packages
│   ├── clients/                  # gRPC client wrappers
│   ├── database/                 # Database utilities
│   ├── kafka/                    # Event streaming utilities
│   ├── grpc/                     # Generated protobuf files
│   └── utilities/                # Common utilities
│
├── proto/                        # Protocol buffer definitions
│   ├── common/                   # Shared types and utilities
│   ├── identity/                 # Identity service API
│   ├── scripts/                  # Scripts service API
│   ├── collab/                   # Collaboration service API
│   ├── billing/                  # Billing service API
│   └── ai/                       # AI service API
│
├── services/                     # Non-Go services
│   └── ai/                       # Python AI service
│
├── migrations/                   # Database migration files
│   ├── identity/                 # Identity DB schema
│   ├── scripts/                  # Scripts DB schema
│   ├── collaboration/            # Collaboration DB schema
│   └── billing/                  # Billing DB schema
│
├── deploy/                       # Deployment configurations
│   ├── dev/                      # Local development
│   └── k8s/                      # Kubernetes manifests
│
├── Makefile                      # Development commands
├── go.mod                        # Go module definition
└── README.md                     # This file
```

## 🚀 Quick Start

### Prerequisites
- Go 1.21+
- Docker and Docker Compose
- Protocol Buffers compiler (`protoc`)
- Make

### Initial Setup
```bash
# Clone the repository (if not already done)
cd server_microservices

# Install protobuf dependencies and set up development environment
make dev-setup

# Download Go dependencies
make deps
```

### Generate Protobuf Files
```bash
make proto
```

### Start Development Environment
```bash
# Start all services with Docker Compose
make run-dev

# View logs
make logs

# View specific service logs
make logs-gateway
make logs-identity
# ... etc
```

### Run Database Migrations
```bash
# Run all migrations
make migrate-up-all

# Or run individual service migrations
make migrate-up-identity
make migrate-up-scripts
make migrate-up-collab
make migrate-up-billing
```

### Access Services
- **API Gateway**: http://localhost:8080
- **Identity Service**: localhost:50051 (gRPC)
- **Scripts Service**: localhost:50052 (gRPC)
- **Collaboration Service**: localhost:50053 (gRPC)
- **Billing Service**: localhost:50054 (gRPC)
- **AI Service**: localhost:50055 (gRPC)

### Development Databases
- **Identity DB**: localhost:5432/identity_db
- **Scripts DB**: localhost:5433/scripts_db
- **Collaboration DB**: localhost:5434/collab_db
- **Billing DB**: localhost:5435/billing_db
- **Redis**: localhost:6379
- **Kafka**: localhost:9092

## 🗄️ Database Schema

### Identity Service (Purple)
- `users` - User accounts and profiles
- `user_sessions` - JWT refresh token management
- `password_reset_tokens` - Password reset functionality
- `email_verification_tokens` - Email verification
- `login_history` - Security audit trail

### Scripts Service (Blue)
- `projects_meta` - Project information and metadata
- `screenplays` - Screenplay content and versioning
- `outline_units` - Unified hierarchy (acts, sequences, beats, sub-beats)
- `scenes` - Individual scenes linked to outline units
- `characters` - Character definitions and attributes
- `locations` - Location definitions
- `screenplay_versions` - Version history

### Collaboration Service (Pink)
- `collaborators` - Project team members and roles
- `comments` - Threaded comments on screenplays
- `edit_sessions` - Real-time editing sessions
- `edit_operations` - Live editing operation log
- `user_presence` - Real-time user presence tracking
- `project_activity` - Activity feed

### Billing Service (Green)
- `plans` - Subscription plans and pricing
- `subscriptions` - User subscriptions
- `payment_methods` - Stored payment methods
- `invoices` - Billing history
- `usage` - Usage metrics and tracking
- `coupons` - Discount codes and promotions

## 🔧 Development Commands

### Building
```bash
make build-all          # Build all services
make build-gateway      # Build specific service
make build-identity
make build-scripts
make build-collab
make build-billing
```

### Testing
```bash
make test               # Run all tests
make test-coverage      # Run tests with coverage report
```

### Code Quality
```bash
make fmt               # Format code
make lint              # Run linter
```

### Protobuf Management
```bash
make proto             # Generate protobuf files
make proto-clean       # Clean generated files
make proto-deps        # Install protobuf tools
```

### Environment Management
```bash
make run-dev           # Start development environment
make stop-dev          # Stop development environment
make clean             # Clean all artifacts
```

## 🔒 Environment Variables

### Required for Development
```bash
# Database connections are auto-configured in docker-compose
# JWT signing (change for production)
JWT_SECRET=dev-secret-key-change-in-production

# Optional: AI service integration
OPENAI_API_KEY=your_openai_api_key

# Optional: Stripe integration for billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 📡 API Communication

### Client → API Gateway
- **Protocol**: HTTP/REST with JSON
- **Authentication**: JWT Bearer tokens
- **Port**: 8080

### API Gateway → Services
- **Protocol**: gRPC
- **Load Balancing**: Round-robin
- **Health Checks**: gRPC health checks

### Service → Service
- **Synchronous**: gRPC client calls
- **Asynchronous**: Kafka events
- **Caching**: Redis for frequently accessed data

## 🎯 Key Features

### Unified Outline Structure
The new `outline_units` table supports flexible hierarchical outlining:
- **Acts** - High-level story structure
- **Sequences** - Major story beats within acts
- **Beats** - Specific plot points or scenes
- **Sub-beats** - Detailed story elements

### Real-time Collaboration
- Live cursor tracking and presence
- Operational transformation for conflict resolution
- Threaded comments with mentions
- Role-based permissions

### AI-Powered Features
- Content generation (dialogue, scenes, characters)
- Script analysis and improvement suggestions
- Format checking and correction
- Genre and tone analysis

### Flexible Billing
- Multiple subscription tiers
- Usage-based billing metrics
- Stripe integration for payments
- Coupon and discount support

## 🔄 Event-Driven Architecture

Services communicate asynchronously via Kafka events:

### Event Topics
- `user-events` - User lifecycle events
- `project-events` - Project creation/updates
- `script-events` - Screenplay modifications
- `collab-events` - Collaboration activities
- `billing-events` - Subscription changes

### Event Types
- `user.created`, `user.updated`
- `project.created`, `project.updated`, `project.deleted`
- `script.updated`
- `comment.added`
- `collaboration.added`, `collaboration.removed`
- `billing.updated`

## 🚦 Health Checks

All services implement gRPC health checks:
```bash
# Check service health
grpc_health_probe -addr=localhost:50051  # Identity
grpc_health_probe -addr=localhost:50052  # Scripts
grpc_health_probe -addr=localhost:50053  # Collaboration
grpc_health_probe -addr=localhost:50054  # Billing
```

## 🔍 Monitoring and Debugging

### Logs
```bash
make logs              # All service logs
make logs-gateway      # API Gateway logs
make logs-identity     # Identity service logs
# ... etc
```

### Database Access
```bash
# Connect to databases
docker-compose -f deploy/dev/docker-compose.yml exec postgres-identity psql -U postgres -d identity_db
docker-compose -f deploy/dev/docker-compose.yml exec postgres-scripts psql -U postgres -d scripts_db
# ... etc
```

### Redis Access
```bash
# Connect to Redis
docker-compose -f deploy/dev/docker-compose.yml exec redis redis-cli
```

### Kafka Topics
```bash
# List Kafka topics
docker-compose -f deploy/dev/docker-compose.yml exec kafka kafka-topics --bootstrap-server localhost:9092 --list

# Consume events
docker-compose -f deploy/dev/docker-compose.yml exec kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic user-events --from-beginning
```

## 🛡️ Security Considerations

### Authentication Flow
1. User authenticates via API Gateway (`/auth/login`)
2. Identity service validates credentials and returns JWT tokens
3. Access token used for API requests (short-lived)
4. Refresh token used to get new access tokens (longer-lived)
5. All service-to-service calls include user context

### Authorization
- Role-based access control (admin, user, premium)
- Project-level permissions (owner, editor, viewer)
- Resource-level authorization in each service

### Data Protection
- Passwords hashed with bcrypt
- JWT tokens signed with shared secret
- Database connections use SSL in production
- Input validation and sanitization

## 📈 Scalability Considerations

### Horizontal Scaling
- Stateless services can be horizontally scaled
- Database per service allows independent scaling
- Kafka partitioning for event parallelism
- Redis clustering for cache scaling

### Performance Optimization
- Connection pooling for databases
- gRPC connection reuse
- Redis caching for hot data
- Database indexing for query optimization

## 🔧 Development Tips

### Adding New Features
1. Update protobuf definitions in `proto/`
2. Regenerate code with `make proto`
3. Implement service logic in `internal/`
4. Add database migrations if needed
5. Update tests and documentation

### Debugging gRPC Services
```bash
# Use grpcurl to test services directly
grpcurl -plaintext localhost:50051 list
grpcurl -plaintext localhost:50051 identity.IdentityService/GetUser
```

### Database Migrations
- Keep migrations in separate files
- Use descriptive names with timestamps
- Test migrations both up and down
- Never modify existing migrations

## 🤝 Contributing

1. Follow Go best practices and conventions
2. Write tests for new functionality
3. Update protobuf definitions when changing APIs
4. Run `make fmt` and `make lint` before committing
5. Update documentation for user-facing changes

## 📞 Support

For development questions or issues:
1. Check service logs with `make logs`
2. Verify service health with health checks
3. Review database schema in `migrations/`
4. Check Kafka events for debugging async issues

## 📋 TODO

- [ ] Implement service discovery for production
- [ ] Add comprehensive logging with structured logs
- [ ] Implement distributed tracing
- [ ] Add Kubernetes deployment manifests
- [ ] Set up CI/CD pipeline
- [ ] Add end-to-end tests
- [ ] Implement API rate limiting
- [ ] Add metrics and monitoring
- [ ] Document production deployment guide
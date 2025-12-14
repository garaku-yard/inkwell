# Scriptlith - Collaborative Screenplay Writing Platform

A modern, microservices-based screenplay writing and collaboration platform built with Go, Next.js, and PostgreSQL.

---

## 📑 Table of Contents

- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Task Commands](#-task-commands)
- [Docker Services](#-docker-services)
- [Database & Migrations](#-database--migrations)
- [Development Workflows](#-development-workflows)
- [Project Structure](#-project-structure)
- [Environment Variables](#-environment-variables)
- [Testing](#-testing)
- [Troubleshooting](#-troubleshooting)
- [Production Deployment](#-production-deployment)

---

## 🏗️ Architecture

### Backend Microservices

- **API Gateway** (port 8080) - HTTP REST API that routes requests to microservices
- **Identity Service** (port 50051) - Authentication and user management (gRPC)
- **Scripts Service** (port 50052) - Screenplay content and structure (gRPC)
- **Collab Service** (port 50053) - Real-time collaboration features (gRPC)
- **Billing Service** (port 50054) - Subscription and payment management (gRPC)
- **AI Service** (port 50055) - AI-powered writing assistance (gRPC)

### Frontend

- **Next.js 14** - React-based client with App Router
- **TailwindCSS** - Styling
- **Shadcn/ui** - Component library

### Infrastructure

- **PostgreSQL** - 4 separate databases (one per domain service)
  - postgres-identity (port 5432)
  - postgres-scripts (port 5433)
  - postgres-collab (port 5434)
  - postgres-billing (port 5435)
- **Redis** (port 6379) - Caching and session management
- **Kafka** (port 9092) - Event streaming between services
- **Zookeeper** (port 2181) - Kafka coordination
- **Docker** - Containerization and orchestration

### Network Architecture

All services communicate on the `scriptlith-network` bridge network:

- Frontend → API Gateway (HTTP REST)
- API Gateway → Microservices (gRPC)
- Microservices → Databases (PostgreSQL)
- Microservices → Redis (caching)
- Microservices → Kafka (event streaming)

---

## 📋 Prerequisites

### Required

1. **Docker Desktop 20.10+** with Docker Compose v2.0+
   - Download from [docker.com](https://www.docker.com/products/docker-desktop)
   - Ensure at least 4GB RAM available for Docker
   - Ensure at least 10GB free disk space

2. **Task Runner** (modern Make alternative)

   ```bash
   # macOS
   brew install go-task
   
   # Linux
   sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin
   
   # Windows
   choco install go-task
   ```

### Optional (only for local development without Docker)

3. **Go 1.24+**

   ```bash
   # macOS
   brew install go
   
   # Linux
   wget https://go.dev/dl/go1.24.0.linux-amd64.tar.gz
   sudo tar -C /usr/local -xzf go1.24.0.linux-amd64.tar.gz
   ```

4. **Node.js 20+**

   ```bash
   # macOS
   brew install node@20
   
   # Linux (using nvm)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 20
   ```

---

## 🚀 Quick Start

### Initial Setup

```bash
# 1. Clone the repository
git clone https://github.com/l1roii/scriptlith.git
cd scriptlith

# 2. Copy environment variables
cp .env.example .env

# 3. Edit .env file with your credentials
nano .env  # or use your preferred editor

# Required environment variables:
# - JWT_SECRET (generate with: openssl rand -base64 32)
# - POSTGRES_PASSWORD (database password)
# - REDIS_PASSWORD (Redis password)
# - OPENAI_API_KEY (optional, from openai.com)
# - ANTHROPIC_API_KEY (optional, from anthropic.com)

# 4. Start all services (builds everything automatically)
task dev
```

This single command will:

- Build all microservices (Gateway, Identity, Scripts, Collab, Billing, AI)
- Build the Next.js frontend
- Start PostgreSQL databases (4 separate DBs)
- Start Redis for caching
- Start Kafka + Zookeeper for event streaming
- Run all database migrations automatically
- Set up persistent volumes for all data

### Access the Application

Once started, the application is available at:

- **Frontend**: <http://localhost:3000>
- **API Gateway**: <http://localhost:8080>

### Next Steps

1. Register a new account at <http://localhost:3000/register>
2. Create your first project
3. Start writing your screenplay!

---

## 📋 Task Commands

### Essential Commands

```bash
# Start everything
task dev

# Stop everything
task docker:down

# Rebuild and restart everything
task docker:rebuild

# Clean everything and rebuild from scratch (⚠️ DELETES ALL DATA)
task fresh

# View all available commands
task --list
```

### Development Workflow

```bash
# Start everything (Docker Compose)
task dev

# Stop everything
task docker:down

# Restart everything
task docker:restart

# Rebuild everything from scratch
task docker:rebuild

# Nuclear option: delete all data and rebuild
task fresh
```

### Utilities

```bash
# Show all available tasks
task --list

# Clean build artifacts and temporary files
task clean
```

---

## 🐳 Docker Services

```bash
# Generate all protobuf files
task proto:gen

# Generate for specific service
task proto:gen:scripts
task proto:gen:identity
task proto:gen:collab
task proto:gen:billing
task proto:gen:common
task proto:gen:ai
```

---

## 🐳 Docker Services

| Service | Port | Type | Description |
|---------|------|------|-------------|
| **client** | 3000 | Frontend | Next.js web application |
| **api-gateway** | 8080 | Backend | HTTP REST API gateway |
| **identity-service** | 50051 | Backend | User authentication (gRPC) |
| **scripts-service** | 50052 | Backend | Screenplay management (gRPC) |
| **collab-service** | 50053 | Backend | Real-time collaboration (gRPC) |
| **billing-service** | 50054 | Backend | Billing & subscriptions (gRPC) |
| **ai-service** | 50055 | Backend | AI writing assistance (gRPC) |
| **postgres-identity** | 5432 | Database | Identity & users DB |
| **postgres-scripts** | 5433 | Database | Scripts & projects DB |
| **postgres-collab** | 5434 | Database | Collaboration & comments DB |
| **postgres-billing** | 5435 | Database | Billing & subscriptions DB |
| **redis** | 6379 | Cache | Session cache & temporary data |
| **kafka** | 9092 | Messaging | Event streaming |
| **zookeeper** | 2181 | Coordination | Kafka coordination |

### Data Persistence

All data is stored in Docker volumes that persist even when containers are stopped:

- `postgres_identity_data` - Identity service database
- `postgres_scripts_data` - Scripts service database
- `postgres_collab_data` - Collaboration service database
- `postgres_billing_data` - Billing service database
- `redis_data` - Redis cache
- `kafka_data` - Kafka messages
- `zookeeper_data` - Zookeeper state
- `zookeeper_logs` - Zookeeper logs

**⚠️ Data is only deleted if you run `docker compose down -v` or `task fresh`**

---

## 🗃️ Database & Migrations

```bash
# Build all Docker images
task docker:build

# Start containers (detached mode)
task docker:up

# Stop containers
task docker:down

# View logs (all services)
task docker:logs

# View logs for specific service
docker compose logs -f client
docker compose logs -f api-gateway
docker compose logs -f scripts-service
docker compose logs -f identity-service

# View container status
task docker:ps

# Rebuild specific service
task docker:rebuild:scripts
task docker:rebuild:collab
task docker:rebuild:identity
task docker:rebuild:billing
task docker:rebuild:gateway
task docker:rebuild:ai
task docker:rebuild:client

# Restart specific service
docker compose restart scripts-service
docker compose restart client

# Clean everything (⚠️ DELETES ALL DATA!)
task docker:clean
```

### Database Operations

```bash
# Start only databases (for local development)
task db:up

# Stop databases
task db:down

# Check migration status (view tables in all databases)
task db:status

# Open PostgreSQL shell for specific database
task db:shell:scripts
task db:shell:identity
task db:shell:collab
task db:shell:billing

# Or use docker compose directly
docker compose exec postgres-identity psql -U postgres -d identity_db
docker compose exec postgres-scripts psql -U postgres -d scripts_db
docker compose exec postgres-collab psql -U postgres -d collab_db
docker compose exec postgres-billing psql -U postgres -d billing_db

# Access Redis CLI
docker compose exec redis redis-cli

# Database connection info for pgAdmin/DBeaver:
# Identity DB:  localhost:5432, database: identity_db, user: postgres
# Scripts DB:   localhost:5433, database: scripts_db, user: postgres
# Collab DB:    localhost:5434, database: collab_db, user: postgres
# Billing DB:   localhost:5435, database: billing_db, user: postgres

# Migrations info
task db:migrate
# Note: Migrations run automatically with GORM AutoMigrate
# No manual migration commands needed!
```

### Protobuf Generation

```bash
# Generate all protobuf files
task proto:gen

# Generate for specific service
task proto:gen:scripts
task proto:gen:identity
task proto:gen:collab
task proto:gen:billing
task proto:gen:common
task proto:gen:ai
```

---

## 🐳 Docker Services

```bash
# Run all tests
task test

# Run backend tests only
task test:server

# Run frontend tests only
task test:client

# Lint all code
task lint

# Format all code
task format
```

### Protobuf Generation

```bash
# Generate all protobuf files
task proto:gen

# Generate for specific service
task proto:gen:scripts
task proto:gen:identity
task proto:gen:collab
task proto:gen:billing
```

### Utilities

```bash
# Show all available tasks
task help
# or
task --list

# Clean build artifacts
task clean

# Setup new development environment
task setup
```

---

## 🗃️ Database & Migrations

This project uses **GORM AutoMigrate**, which works like **Entity Framework Core** in C#:

### How It Works

1. **Define Models** in `internal/*/models/models.go`:

   ```go
   type Project struct {
       ProjectID   uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
       Title       string    `gorm:"type:varchar(255);not null"`
       OwnerID     uuid.UUID `gorm:"type:uuid;not null;index"`
       CreatedAt   time.Time `gorm:"autoCreateTime"`
       UpdatedAt   time.Time `gorm:"autoUpdateTime"`
   }
   ```

2. **AutoMigrate Runs Automatically** when you start the service:

   ```go
   // In main.go
   models.AutoMigrate(gormDB)
   ```

3. **Schema Updates Automatically** - just modify the struct and restart!

### Making Schema Changes

```bash
# 1. Edit model in internal/scripts/models/models.go
# 2. Rebuild the service
task docker:rebuild:scripts

# That's it! GORM will:
# - Create new tables if they don't exist
# - Add new columns if you added fields
# - Modify column types if you changed field types
```

### GORM Tags Reference

```go
// Primary Key
`gorm:"primaryKey"`

// Column type
`gorm:"type:varchar(255)"`
`gorm:"type:uuid"`
`gorm:"type:jsonb"`

// Constraints
`gorm:"not null"`
`gorm:"unique"`
`gorm:"default:0"`

// Indexes
`gorm:"index"`
`gorm:"uniqueIndex"`

// Foreign Keys
`gorm:"foreignKey:ProjectID"`
`gorm:"constraint:OnDelete:CASCADE"`

// Timestamps
`gorm:"autoCreateTime"`  // Sets on creation
`gorm:"autoUpdateTime"`  // Updates on save

// Ignore field
`gorm:"-"`
```

### Migration Best Practices

- **Always test locally first** before deploying
- **Use descriptive field names** (GORM converts to snake_case)
- **Define indexes** for frequently queried columns
- **Set cascade deletes** for child relationships
- **Run `task db:status`** to verify migrations

### Viewing Tables

```bash
# Check what tables exist
task db:status

# Or open a database shell
task db:shell:scripts

# Then run SQL:
\dt                    # List tables
\d projects            # Describe table structure
SELECT * FROM projects LIMIT 5;
```

---

## 🏃 Development Workflows

### Working on Backend (Go Services)

```bash
# 1. Start databases only
task db:up

# 2. Run specific service locally (for debugging)
cd server
go run cmd/scripts/main.go

# Or run in Docker and rebuild on changes
task docker:rebuild:scripts
```

### Working on Frontend (Next.js)

```bash
# 1. Start backend services
task docker:up

# 2. Run frontend locally with hot reload
cd client
npm run dev

# Or run everything in Docker
task docker:rebuild:client
```

### Adding a New Feature

```bash
# 1. Create feature branch
git checkout -b feat/my-feature

# 2. Make changes to code

# 3. Update models if needed (see "Database Migrations" section)

# 4. Rebuild affected services
task docker:rebuild:scripts

# 5. Test changes
task test

# 6. Lint code
task lint

# 7. Commit and push
git add .
git commit -m "feat: add my feature"
git push origin feat/my-feature
```

### Debugging Issues

```bash
# View logs for all services
task docker:logs

# View logs for specific service
docker compose logs -f scripts-service

# Check container status
task docker:ps

# Open database shell to inspect data
task db:shell:scripts

# Restart problematic service
task service:scripts

# Nuclear option: clean everything
task fresh
```

## 📁 Project Structure

```
scriptlith/
├── client/                      # Next.js frontend
│   ├── app/                     # App Router pages
│   │   ├── (private)/          # Protected routes
│   │   │   ├── dashboard/      # Dashboard page
│   │   │   └── projects/       # Project pages
│   │   └── (public)/           # Public routes
│   ├── components/             # React components
│   │   ├── beat-board/        # Beat board canvas
│   │   ├── editor/            # Screenplay editor
│   │   ├── outline-editor/    # Outline view
│   │   └── ui/                # Shadcn components
│   ├── services/              # API client services
│   └── lib/                   # Utilities
│
├── server/                      # Go backend
│   ├── cmd/                    # Service entry points
│   │   ├── gateway/           # API Gateway
│   │   ├── identity/          # Identity Service
│   │   ├── scripts/           # Scripts Service
│   │   ├── collab/            # Collaboration Service
│   │   └── billing/           # Billing Service
│   │
│   ├── internal/              # Internal packages
│   │   ├── scripts/
│   │   │   ├── models/        # GORM models
│   │   │   ├── handler/       # HTTP/gRPC handlers
│   │   │   ├── repository/    # Data access
│   │   │   └── service/       # Business logic
│   │   ├── identity/          # (same structure)
│   │   ├── collab/            # (same structure)
│   │   └── billing/           # (same structure)
│   │
│   ├── pkg/                   # Shared packages
│   │   ├── database/          # DB utilities
│   │   ├── grpc/              # gRPC definitions
│   │   └── utils/             # Helpers
│   │
│   └── proto/                 # Protobuf definitions
│
├── docker-compose.yml         # Docker orchestration
├── Taskfile.yml              # Task runner commands
├── .env.example              # Environment variables template
└── README.md                 # This file
```

---

## 🔧 Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database Credentials
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres  # ⚠️ Change in production!

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-super-secret-jwt-key-here

# Redis Password
REDIS_PASSWORD=redis  # ⚠️ Change in production!

# AI Service Keys (optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Database URLs (auto-configured in Docker)
SCRIPTS_DB_HOST=postgres-scripts
IDENTITY_DB_HOST=postgres-identity
COLLAB_DB_HOST=postgres-collab
BILLING_DB_HOST=postgres-billing

# Redis & Kafka (auto-configured in Docker)
REDIS_URL=redis://redis:6379
KAFKA_BROKERS=kafka:9092
```

---

---

## 🧪 Testing

```bash
# Run all tests
task test

# Run backend tests with coverage
cd server
go test -v -cover ./...

# Run frontend tests
cd client
npm test

# E2E tests (if configured)
npm run test:e2e
```

---

## 🚨 Troubleshooting

### Containers Won't Start

```bash
# Check Docker is running
docker ps

# View detailed logs for all services
task docker:logs

# View logs for specific service
docker compose logs -f scripts-service

# Check for port conflicts
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Check service health
docker compose ps

# Clean and rebuild everything
task fresh
```

### Database Connection Errors

```bash
# Ensure database containers are running
task docker:ps

# Wait for databases to be ready (check health status)
docker compose ps

# Verify migrations ran successfully
task db:status

# Restart database services
docker compose restart postgres-identity postgres-scripts postgres-collab postgres-billing

# View database logs
docker compose logs postgres-scripts
```

### Port Conflicts

If ports are already in use, edit `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"  # Change 3000 to 3001 for frontend
  - "8081:8080"  # Change 8080 to 8081 for API gateway
```

### Out of Memory

Increase Docker's memory limit in Docker Desktop settings or add to services:

```yaml
services:
  client:
    deploy:
      resources:
        limits:
          memory: 1G
```

### Build Failures

```bash
# Clean build artifacts
task clean

# Remove all Docker images and rebuild
docker compose down --rmi all
task docker:rebuild

# Check versions
go version      # Should be 1.24+
node --version  # Should be 20+
docker --version
```

### GORM Migration Issues

```bash
# Check what tables exist
docker compose exec postgres-scripts psql -U postgres -d scripts_db -c "\dt"

# View migration logs
docker compose logs scripts-service | grep -i migrat

# Force migration rerun (rebuild service)
task docker:rebuild:scripts
```

### Authentication Issues

```bash
# Check JWT_SECRET is set in .env
cat .env | grep JWT_SECRET

# View auth-related logs
docker compose logs identity-service | grep -i error

# Clear browser localStorage and try again
# In browser console: localStorage.clear()
```

### Common Error Messages

| Error | Solution |
|-------|----------|
| "relation does not exist" | Run `task docker:rebuild:<service>` to run migrations |
| "connection refused" | Wait for services to start, check `docker compose ps` |
| "port is already allocated" | Change port in docker-compose.yml or kill conflicting process |
| "no space left on device" | Run `docker system prune -a` to free space |

---

## 🚀 Production Deployment

### Production Checklist

Before deploying to production:

1. **Security**
   - [ ] Change `JWT_SECRET` to a strong random value
   - [ ] Use strong `POSTGRES_PASSWORD`
   - [ ] Change `REDIS_PASSWORD`
   - [ ] Never commit `.env` to git
   - [ ] Use Docker secrets for sensitive data

2. **Configuration**
   - [ ] Set `NODE_ENV=production`
   - [ ] Configure proper CORS origins
   - [ ] Enable HTTPS/TLS
   - [ ] Set up SSL certificates

3. **Infrastructure**
   - [ ] Use managed PostgreSQL (AWS RDS, GCP Cloud SQL, etc.)
   - [ ] Use managed Redis (AWS ElastiCache, Redis Cloud, etc.)
   - [ ] Use managed Kafka or event streaming service
   - [ ] Set up monitoring and logging (Datadog, New Relic, etc.)
   - [ ] Configure automated backups
   - [ ] Set up health checks and alerts

4. **Performance**
   - [ ] Enable caching strategies
   - [ ] Configure CDN for static assets
   - [ ] Optimize database indexes
   - [ ] Set appropriate resource limits

### Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| JWT Secret | `dev-secret-key` | Strong random value |
| Database Password | `postgres` | Strong password |
| CORS | `localhost:3000` | Specific domains |
| HTTPS | Not required | Required |
| Logs | Debug level | Info/Warning level |
| Hot Reload | Enabled (local) | Disabled |
| Resource Limits | Minimal | Optimized for load |

---

## 📚 Additional Resources

- **GORM Documentation**: <https://gorm.io/docs/>
- **Next.js Documentation**: <https://nextjs.org/docs>
- **Docker Compose Documentation**: <https://docs.docker.com/compose/>
- **Task Documentation**: <https://taskfile.dev/>
- **gRPC Documentation**: <https://grpc.io/docs/>

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Make your changes
4. Run tests: `task test`
5. Commit: `git commit -m 'feat: add amazing feature'`
6. Push: `git push origin feat/my-feature`
7. Open a Pull Request

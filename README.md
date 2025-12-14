# Scriptlith - Collaborative Screenplay Writing Platform

A modern, microservices-based screenplay writing and collaboration platform built with Go, Next.js, and PostgreSQL.

## 🏗️ Architecture

**Backend:**
- **API Gateway** - Routes requests to microservices
- **Identity Service** - Authentication and user management
- **Scripts Service** - Screenplay content and structure
- **Collab Service** - Real-time collaboration features
- **Billing Service** - Subscription and payment management
- **AI Service** - AI-powered writing assistance

**Frontend:**
- **Next.js 14** - React-based client with App Router
- **TailwindCSS** - Styling
- **Shadcn/ui** - Component library

**Infrastructure:**
- **PostgreSQL** - 4 separate databases (one per domain service)
- **Redis** - Caching and session management
- **Kafka** - Event streaming between services
- **Docker** - Containerization

## 🚀 Quick Start

### Prerequisites

1. **Install Task Runner** (modern Make alternative):
   ```bash
   # macOS
   brew install go-task
   
   # Linux
   sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin
   
   # Windows
   choco install go-task
   ```

2. **Install Docker Desktop**:
   - Download from [docker.com](https://www.docker.com/products/docker-desktop)
   - Ensure Docker Compose is included (it is by default)

3. **Install Go 1.21+** (optional, only needed for local development):
   ```bash
   # macOS
   brew install go
   
   # Linux
   wget https://go.dev/dl/go1.21.0.linux-amd64.tar.gz
   sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
   ```

4. **Install Node.js 20+** (optional, only needed for local development):
   ```bash
   # macOS
   brew install node@20
   
   # Linux (using nvm)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 20
   ```

### Initial Setup

```bash
# 1. Clone the repository
git clone https://github.com/l1roii/scriptlith.git
cd scriptlith

# 2. Run setup (installs dependencies, creates .env)
task setup

# 3. Edit .env file with your API keys
nano .env  # or use your preferred editor

# Required environment variables:
# - JWT_SECRET (generate with: openssl rand -base64 32)
# - OPENAI_API_KEY (from openai.com)
# - ANTHROPIC_API_KEY (from anthropic.com)

# 4. Start all services
task dev
```

That's it! The application will be available at:
- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8080

## 📋 Task Commands Reference

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

### Building Services

```bash
# Build all services (Go + Node.js)
task build:all

# Build only backend services
task build:server

# Build only frontend
task build:client

# Build individual Go service
task build:server:scripts
task build:server:identity
task build:server:collab
task build:server:billing
task build:server:gateway
```

### Docker Operations

```bash
# Build all Docker images
task docker:build

# Start containers (detached mode)
task docker:up

# Stop containers
task docker:down

# View logs (all services)
task docker:logs

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

# Clean everything (DELETES ALL DATA!)
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

# Migrations info
task db:migrate
# Note: Migrations run automatically with GORM AutoMigrate
# No manual migration commands needed!
```

### Service-Specific Operations

```bash
# Restart and view logs for specific service
task service:gateway
task service:scripts
task service:identity
task service:client
```

### Code Quality

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

## 🗃️ Database Migrations (EF Core-style with GORM)

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

## 🔧 Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database URLs (auto-configured in Docker)
SCRIPTS_DATABASE_URL=postgresql://postgres:postgres@postgres-scripts:5432/scripts_db
IDENTITY_DATABASE_URL=postgresql://postgres:postgres@postgres-identity:5432/identity_db
COLLAB_DATABASE_URL=postgresql://postgres:postgres@postgres-collab:5432/collab_db
BILLING_DATABASE_URL=postgresql://postgres:postgres@postgres-billing:5432/billing_db

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-super-secret-jwt-key-here

# AI Service Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Redis
REDIS_URL=redis://redis:6379

# Kafka
KAFKA_BROKERS=kafka:9092

# Migration control
RUN_MIGRATIONS=true
```

## 🐳 Docker Services

| Service | Port | Description |
|---------|------|-------------|
| client | 3000 | Next.js frontend |
| api-gateway | 8080 | HTTP API gateway |
| identity-service | 50051 | gRPC identity service |
| scripts-service | 50052 | gRPC scripts service |
| collab-service | 50053 | gRPC collab service |
| billing-service | 50054 | gRPC billing service |
| ai-service | 50055 | gRPC AI service |
| postgres-identity | 5432 | Identity database |
| postgres-scripts | 5433 | Scripts database |
| postgres-collab | 5434 | Collab database |
| postgres-billing | 5435 | Billing database |
| redis | 6379 | Cache and sessions |
| kafka | 9092 | Event streaming |
| zookeeper | 2181 | Kafka coordination |

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

## 🚨 Troubleshooting

### Containers won't start

```bash
# Check Docker is running
docker ps

# View detailed logs
task docker:logs

# Check for port conflicts
lsof -i :3000  # or other ports

# Clean and rebuild
task fresh
```

### Database connection errors

```bash
# Check database containers are running
task docker:ps

# Verify migrations ran
task db:status

# Restart database services
task db:down
task db:up
```

### "No such file or directory" errors

```bash
# Ensure .env file exists
cp .env.example .env

# Ensure all dependencies are installed
task install
```

### GORM migration issues

```bash
# Check what tables exist
task db:shell:scripts
\dt

# Force migration rerun (restart service)
task docker:rebuild:scripts

# View migration logs
docker compose logs scripts-service | grep -i migrat
```

### Build failures

```bash
# Clean build artifacts
task clean

# Rebuild from scratch
task docker:rebuild

# Check Go version
go version  # Should be 1.21+

# Check Node version
node --version  # Should be 20+
```

## 📚 Additional Resources

- **GORM Documentation**: https://gorm.io/docs/
- **Next.js Documentation**: https://nextjs.org/docs
- **Docker Compose Documentation**: https://docs.docker.com/compose/
- **Task Documentation**: https://taskfile.dev/

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Make your changes
4. Run tests: `task test`
5. Commit: `git commit -m 'feat: add amazing feature'`
6. Push: `git push origin feat/my-feature`
7. Open a Pull Request

## 📄 License

MIT License - See LICENSE file for details

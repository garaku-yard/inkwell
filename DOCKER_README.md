# Scriptlith - Docker Setup Guide

This guide explains how to run the entire Scriptlith application using Docker Compose.

## Prerequisites

- Docker Engine 20.10+ 
- Docker Compose v2.0+
- At least 4GB RAM available for Docker
- At least 10GB free disk space

## Quick Start

### 1. Clone the repository
```bash
git clone <repository-url>
cd scriptlith
```

### 2. Copy environment variables
```bash
cp .env.example .env
```

Edit `.env` and set your API keys and secrets (especially `JWT_SECRET` for production).

### 3. Start all services
```bash
docker compose up -d
```

This single command will:
- Build all microservices (Gateway, Identity, Scripts, Collab, Billing, AI)
- Build the Next.js frontend
- Start PostgreSQL databases (4 separate DBs for microservices)
- Start Redis for caching
- Start Kafka + Zookeeper for event streaming
- Run all database migrations automatically
- Set up persistent volumes for all data

### 4. Access the application

- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8080
- **Identity Service**: grpc://localhost:50051
- **Scripts Service**: grpc://localhost:50052
- **Collab Service**: grpc://localhost:50053
- **Billing Service**: grpc://localhost:50054
- **AI Service**: grpc://localhost:50055

## Services Overview

### Databases
- **postgres-identity** (port 5432): User authentication and authorization
- **postgres-scripts** (port 5433): Screenplay scripts and elements
- **postgres-collab** (port 5434): Collaboration features (comments, presence)
- **postgres-billing** (port 5435): Billing and subscriptions

### Infrastructure
- **redis** (port 6379): Caching layer
- **kafka** (port 9092): Event streaming
- **zookeeper** (port 2181): Kafka coordination

### Microservices
- **api-gateway** (port 8080): HTTP REST API gateway
- **identity-service** (port 50051): Authentication gRPC service
- **scripts-service** (port 50052): Scripts management gRPC service
- **collab-service** (port 50053): Collaboration gRPC service
- **billing-service** (port 50054): Billing gRPC service
- **ai-service** (port 50055): AI features gRPC service

### Frontend
- **client** (port 3000): Next.js web application

## Common Commands

### View logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f client
docker compose logs -f api-gateway
docker compose logs -f scripts-service
```

### Stop all services
```bash
docker compose down
```

### Stop and remove volumes (⚠️ deletes all data)
```bash
docker compose down -v
```

### Rebuild a specific service
```bash
docker compose up -d --build client
docker compose up -d --build scripts-service
```

### Check service health
```bash
docker compose ps
```

### Access database
```bash
# Identity DB
docker compose exec postgres-identity psql -U postgres -d identity_db

# Scripts DB
docker compose exec postgres-scripts psql -U postgres -d scripts_db

# Collab DB
docker compose exec postgres-collab psql -U postgres -d collab_db

# Billing DB
docker compose exec postgres-billing psql -U postgres -d billing_db
```

### Access Redis CLI
```bash
docker compose exec redis redis-cli
```

## Data Persistence

All data is stored in Docker volumes:
- `postgres_identity_data`: Identity service database
- `postgres_scripts_data`: Scripts service database
- `postgres_collab_data`: Collaboration service database
- `postgres_billing_data`: Billing service database
- `redis_data`: Redis cache
- `kafka_data`: Kafka messages
- `zookeeper_data`: Zookeeper state
- `zookeeper_logs`: Zookeeper logs

These volumes persist even when containers are stopped. Data is only deleted if you run `docker compose down -v`.

## Database Migrations

Migrations run automatically when each service starts. The services check for existing tables and create them if they don't exist.

To verify migrations ran successfully:
```bash
# Check scripts database tables
docker compose exec postgres-scripts psql -U postgres -d scripts_db -c "\dt"

# Check identity database tables
docker compose exec postgres-identity psql -U postgres -d identity_db -c "\dt"
```

You should see tables like:
- **identity_db**: users, sessions, etc.
- **scripts_db**: projects, script_elements, scenes, beats, lanes, outline_items, etc.
- **collab_db**: collaborators, comments, edit_sessions, etc.
- **billing_db**: subscriptions, invoices, etc.

## Troubleshooting

### Services won't start
```bash
# Check logs for errors
docker compose logs

# Restart all services
docker compose restart
```

### Database connection errors
```bash
# Ensure databases are healthy
docker compose ps

# Restart database services
docker compose restart postgres-identity postgres-scripts postgres-collab postgres-billing
```

### Port conflicts
If ports are already in use, edit `docker-compose.yml` to change the port mappings:
```yaml
ports:
  - "3001:3000"  # Change 3000 to 3001 for frontend
```

### Out of memory
Increase Docker's memory limit in Docker Desktop settings or add to docker-compose.yml:
```yaml
services:
  client:
    deploy:
      resources:
        limits:
          memory: 1G
```

### Clear everything and start fresh
```bash
# Stop and remove everything
docker compose down -v

# Remove all images
docker compose down --rmi all

# Rebuild and start
docker compose up -d --build
```

## Development vs Production

### Development
The provided setup is configured for development with:
- Hot reload disabled in Docker (run locally for hot reload)
- Debug ports exposed
- Default credentials (change in production!)

### Production
For production deployment:
1. Change `JWT_SECRET` to a strong random value
2. Use environment-specific secrets for Stripe, OpenAI
3. Set `NODE_ENV=production`
4. Use stronger PostgreSQL passwords
5. Enable HTTPS/TLS
6. Configure proper CORS origins
7. Use Docker secrets for sensitive data
8. Set up monitoring and logging

## Network Architecture

All services communicate on the `scriptlith-network` bridge network:
- Frontend → API Gateway (HTTP)
- API Gateway → Microservices (gRPC)
- Microservices → Databases (PostgreSQL)
- Microservices → Redis (caching)
- Microservices → Kafka (events)

## Next Steps

After starting the services:
1. Create an account at http://localhost:3000/register
2. Create a new project
3. Start writing your screenplay!

## Support

For issues or questions, check the logs first:
```bash
docker compose logs -f
```

Common issues are usually:
- Port conflicts
- Memory limits
- Database connection timeouts (wait for healthchecks)

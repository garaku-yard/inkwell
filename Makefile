.PHONY: help build up down restart logs clean prune status shell-db

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build all services
	docker compose build

up: ## Start all services
	docker compose up -d

down: ## Stop all services
	docker compose down

restart: ## Restart all services
	docker compose restart

logs: ## Show logs from all services
	docker compose logs -f

logs-client: ## Show client logs
	docker compose logs -f client

logs-gateway: ## Show API gateway logs
	docker compose logs -f api-gateway

logs-scripts: ## Show scripts service logs
	docker compose logs -f scripts-service

status: ## Show status of all services
	docker compose ps

clean: ## Stop services and remove containers
	docker compose down --remove-orphans

prune: ## Stop services and remove all volumes (WARNING: deletes all data!)
	@echo "WARNING: This will delete all database data!"
	@read -p "Are you sure? (yes/no): " confirm && [ "$$confirm" = "yes" ]
	docker compose down -v --remove-orphans

rebuild: down build up ## Rebuild and restart all services

rebuild-client: ## Rebuild and restart only the client
	docker compose up -d --build client

rebuild-gateway: ## Rebuild and restart only the gateway
	docker compose up -d --build api-gateway

shell-identity-db: ## Open psql shell to identity database
	docker compose exec postgres-identity psql -U postgres -d identity_db

shell-scripts-db: ## Open psql shell to scripts database
	docker compose exec postgres-scripts psql -U postgres -d scripts_db

shell-collab-db: ## Open psql shell to collab database
	docker compose exec postgres-collab psql -U postgres -d collab_db

shell-billing-db: ## Open psql shell to billing database
	docker compose exec postgres-billing psql -U postgres -d billing_db

shell-redis: ## Open redis-cli
	docker compose exec redis redis-cli

check-migrations: ## Check if migrations have run
	@echo "Checking identity_db tables..."
	@docker compose exec postgres-identity psql -U postgres -d identity_db -c "\dt" || true
	@echo "\nChecking scripts_db tables..."
	@docker compose exec postgres-scripts psql -U postgres -d scripts_db -c "\dt" || true
	@echo "\nChecking collab_db tables..."
	@docker compose exec postgres-collab psql -U postgres -d collab_db -c "\dt" || true
	@echo "\nChecking billing_db tables..."
	@docker compose exec postgres-billing psql -U postgres -d billing_db -c "\dt" || true

dev: ## Start services in development mode with logs
	docker compose up --build

fresh-start: prune build up ## Complete fresh start (WARNING: deletes all data!)
	@echo "Waiting for services to be healthy..."
	@sleep 10
	@make status

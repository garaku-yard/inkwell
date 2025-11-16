#!/bin/bash

# Database Migration Script for Scriptlith Microservices
# This script sets up the databases for all services

set -e

# Configuration - update these with your actual database credentials
POSTGRES_HOST=${POSTGRES_HOST:-localhost}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-root}

# Database names for each service
IDENTITY_DB=${IDENTITY_DB:-identity_db}
SCRIPTS_DB=${SCRIPTS_DB:-scripts_db}
COLLABORATION_DB=${COLLABORATION_DB:-collaboration_db}

echo "🗄️  Setting up Scriptlith databases..."

# Function to run SQL command
run_sql() {
  local db_name=$1
  local sql_file=$2
  echo "Running migration: $sql_file on database: $db_name"
  PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $db_name -f $sql_file
}

# Function to create database if it doesn't exist
create_database() {
  local db_name=$1
  echo "Creating database: $db_name"
  PGPASSWORD=$POSTGRES_PASSWORD createdb -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER $db_name 2>/dev/null || echo "Database $db_name already exists"
}

# Create databases
echo "📊 Creating databases..."
create_database $IDENTITY_DB
create_database $SCRIPTS_DB
create_database $COLLABORATION_DB

# Run Identity Service migrations
echo "👤 Running Identity Service migrations..."
if [ -d "migrations/identity" ]; then
  for migration in migrations/identity/*.sql; do
    if [ -f "$migration" ]; then
      run_sql $IDENTITY_DB "$migration"
    fi
  done
else
  echo "No Identity migrations found"
fi

# Run Scripts Service migrations
echo "📝 Running Scripts Service migrations..."
if [ -d "migrations/scripts" ]; then
  for migration in migrations/scripts/*.sql; do
    if [ -f "$migration" ]; then
      run_sql $SCRIPTS_DB "$migration"
    fi
  done
else
  echo "No Scripts migrations found - will be created later"
fi

# Run Collaboration Service migrations
echo "👥 Running Collaboration Service migrations..."
if [ -d "migrations/collaboration" ]; then
  for migration in migrations/collaboration/*.sql; do
    if [ -f "$migration" ]; then
      run_sql $COLLABORATION_DB "$migration"
    fi
  done
else
  echo "No Collaboration migrations found - will be created later"
fi

echo "✅ Database setup complete!"
echo ""
echo "📋 Database Information:"
echo "  Identity DB: $IDENTITY_DB"
echo "  Scripts DB: $SCRIPTS_DB"
echo "  Collaboration DB: $COLLABORATION_DB"
echo ""
echo "🚀 You can now start the services with:"
echo "  ./bin/identity"
echo "  ./bin/gateway"
echo ""
echo "🔧 Set these environment variables for the services:"
echo "  export IDENTITY_DB_PASSWORD=$POSTGRES_PASSWORD"
echo "  export IDENTITY_DB_NAME=$IDENTITY_DB"


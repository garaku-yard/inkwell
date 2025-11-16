# Environment Configuration for Docker PostgreSQL
export IDENTITY_DB_HOST=localhost
export IDENTITY_DB_PORT=5432  
export IDENTITY_DB_USER=postgres
export IDENTITY_DB_PASSWORD=postgres  # Adjust if your Docker postgres has different password
export IDENTITY_DB_NAME=identity_db
export IDENTITY_DB_SSLMODE=disable

# JWT Configuration
export JWT_ACCESS_SECRET=dev-super-secret-access-key-change-in-production
export JWT_REFRESH_SECRET=dev-super-secret-refresh-key-change-in-production

# Server Configuration
export GRPC_PORT=50051

echo "Environment variables set for Docker PostgreSQL"
echo "Now you can run: ./bin/identity"
#!/bin/sh
set -e

# Load 1Password secrets if enabled (optional)
if [ -f "/app/scripts/load-1password-secrets.sh" ]; then
  . /app/scripts/load-1password-secrets.sh
fi

# Validate required environment variables
if [ -z "${DATABASE_URL}" ]; then
  echo "ERROR: DATABASE_URL is required but not set"
  exit 1
fi
echo "Environment variables validated"

# Wait for database to be ready
echo "Waiting for database to be ready..."

# Extract host and port from DATABASE_URL
# Format: postgres://user:pass@host:port/database or postgresql://user:pass@host:port/database
# Remove protocol and credentials, then extract host:port
DB_CONNECTION=$(echo "$DATABASE_URL" | sed -E 's/^(postgres|postgresql):\/\/[^@]*@//')
DB_HOST=$(echo "$DB_CONNECTION" | sed -E 's/^([^:]+):.*$/\1/')
DB_PORT=$(echo "$DB_CONNECTION" | sed -E 's/^.*:([0-9]+)\/.*$/\1/')

: "${DB_HOST:=postgres}"
: "${DB_PORT:=5432}"

# Check if pg_isready is available, otherwise skip the wait
if command -v pg_isready >/dev/null 2>&1; then
  until pg_isready -h "$DB_HOST" -p "$DB_PORT" 2>/dev/null; do
    echo "   Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
    sleep 2
  done
  echo "Database is ready"
else
  echo "pg_isready not found, skipping database readiness check"
  echo "Assuming database at ${DB_HOST}:${DB_PORT} is ready"
fi

# Run database migrations using programmatic runner
echo "Running database migrations..."

if [ -n "${DATABASE_URL}" ]; then
  if node dist/packages/db-core/src/migrations/cli.js; then
    echo "Migrations completed successfully"
  else
    echo "ERROR: Database migrations failed"
    exit 1
  fi
else
  echo "WARNING: DATABASE_URL not set, skipping migrations"
fi

# Run events database migrations
echo "Running events database migrations..."
if node dist/packages/db-outbox/src/migrations/cli.js; then
  echo "Events database migrations completed successfully"
else
  echo "ERROR: Events database migrations failed"
  exit 1
fi

# Start the application
echo "Starting NestJS API..."
exec node dist/apps/api/main.js

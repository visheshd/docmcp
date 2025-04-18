#!/bin/sh
set -e

echo "Starting DocMCP server entrypoint script..."

# Function to check if PostgreSQL is ready
wait_for_postgres() {
  echo "Waiting for PostgreSQL to be ready..."
  
  # Wait for up to 30 seconds for PostgreSQL to be ready
  RETRIES=30
  until [ $RETRIES -eq 0 ] || nc -z postgres 5432; do
    echo "PostgreSQL is not available yet, waiting..."
    RETRIES=$((RETRIES-1))
    sleep 1
  done
  
  if [ $RETRIES -eq 0 ]; then
    echo "Failed to connect to PostgreSQL" >&2
    exit 1
  fi
  
  echo "PostgreSQL is ready!"
  return 0
}

# Wait for PostgreSQL to be fully ready
wait_for_postgres

# Run Prisma migrations
echo "Running Prisma migrations..."
npx prisma migrate deploy

# Generate Prisma client if needed
if [ ! -d "./src/generated/prisma" ]; then
  echo "Generating Prisma client..."
  npx prisma generate
fi

# Start the application
echo "Starting DocMCP server..."
exec node dist/server.js 
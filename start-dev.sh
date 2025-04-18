#!/bin/bash

# Start postgres with Docker Compose
echo "Starting PostgreSQL with pgvector support..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for postgres to be ready
echo "Waiting for PostgreSQL to be ready..."
sleep 5

echo "PostgreSQL with pgvector is now running on port 5433"
echo "Database URL: postgresql://postgres:postgres@localhost:5433/docmcp"
echo ""
echo "To connect manually: psql -h localhost -p 5433 -U postgres -d docmcp"
echo "Password: postgres"

# The DATABASE_URL environment variable for your application would be:
# export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/docmcp" 
#!/bin/bash

echo "Starting DocMCP Docker environment in production mode..."

# Create necessary directories
mkdir -p logs

# Make sure scripts are executable
chmod +x docker-entrypoint.sh
chmod +x healthcheck.sh
chmod +x init-scripts/01-init-pgvector.sh

# Check if .env file exists
if [ ! -f .env ]; then
  echo "WARNING: .env file not found, creating from example"
  cp .env.example .env
  echo "Please review and update the .env file with your production settings"
fi

# Build and start the containers in detached mode with production configuration
docker-compose -f docker-compose.prod.yml up -d --build

# Check if containers are running
if [ $? -eq 0 ]; then
  echo "DocMCP services started successfully in production mode!"
  echo "API available at: http://localhost:1337"
  echo ""
  echo "View logs with: docker-compose -f docker-compose.prod.yml logs -f"
  echo "Stop services with: ./docker-stop-prod.sh"
else
  echo "Failed to start DocMCP services. Check the logs with: docker-compose -f docker-compose.prod.yml logs"
fi 
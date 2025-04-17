#!/bin/bash

echo "Starting DocMCP Docker environment..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Make sure init script is executable
chmod +x init-scripts/01-init-pgvector.sh

# Build and start the containers in detached mode
docker-compose up -d --build

# Check if containers are running
if [ $? -eq 0 ]; then
  echo "DocMCP services started successfully!"
  echo "API available at: http://localhost:1337"
  echo ""
  echo "View logs with: docker-compose logs -f"
  echo "Stop services with: ./docker-stop.sh"
else
  echo "Failed to start DocMCP services. Check the logs with: docker-compose logs"
fi 
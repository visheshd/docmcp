#!/bin/bash

echo "Stopping DocMCP Docker environment in production mode..."

# Stop the containers
docker-compose -f docker-compose.prod.yml down

# Check if containers are stopped
if [ $? -eq 0 ]; then
  echo "DocMCP services stopped successfully!"
else
  echo "Failed to stop DocMCP services. You may need to manually run: docker-compose -f docker-compose.prod.yml down --remove-orphans"
fi 
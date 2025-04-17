#!/bin/bash

echo "Stopping DocMCP Docker environment..."

# Stop the containers
docker-compose down

# Check if containers are stopped
if [ $? -eq 0 ]; then
  echo "DocMCP services stopped successfully!"
else
  echo "Failed to stop DocMCP services. You may need to manually run: docker-compose down --remove-orphans"
fi 
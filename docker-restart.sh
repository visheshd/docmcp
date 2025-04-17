#!/bin/bash

echo "Restarting DocMCP Docker environment..."

# Identify which compose file to use
if [ "$1" == "prod" ] || [ "$1" == "production" ]; then
  COMPOSE_FILE="docker-compose.prod.yml"
  echo "Using production configuration."
else
  COMPOSE_FILE="docker-compose.yml"
  echo "Using development configuration. Use './docker-restart.sh prod' for production mode."
fi

# Stop the containers
echo "Stopping containers..."
docker-compose -f $COMPOSE_FILE down

# Check if stop was successful
if [ $? -ne 0 ]; then
  echo "Warning: There might have been issues stopping the containers."
fi

# Start the containers again
echo "Starting containers..."
docker-compose -f $COMPOSE_FILE up -d --build

# Check if start was successful
if [ $? -eq 0 ]; then
  echo "DocMCP services restarted successfully!"
  echo "API available at: http://localhost:1337"
else
  echo "Failed to restart DocMCP services. Check the logs with: docker-compose -f $COMPOSE_FILE logs"
fi 
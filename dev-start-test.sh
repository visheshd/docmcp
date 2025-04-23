#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting DocMCP test environment...${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Start PostgreSQL container with docker-compose.test.yml
echo -e "${YELLOW}Starting test PostgreSQL container...${NC}"
docker-compose -f docker-compose.test.yml up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
sleep 5

# Get the actual container name
CONTAINER_NAME="docmcp-postgres-test"

if ! docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
    echo -e "${RED}Could not find PostgreSQL test container. Please check if it started correctly.${NC}"
    exit 1
fi

echo -e "${YELLOW}Found PostgreSQL test container: ${CONTAINER_NAME}${NC}"

# Keep trying to connect to PostgreSQL until it's ready (with timeout)
TIMEOUT=60
ELAPSED=0
while ! docker exec $CONTAINER_NAME pg_isready -U postgres > /dev/null 2>&1; do
    if [ $ELAPSED -ge $TIMEOUT ]; then
        echo -e "${RED}Timed out waiting for PostgreSQL to be ready. Please check the container logs:${NC}"
        echo -e "${YELLOW}docker logs ${CONTAINER_NAME}${NC}"
        exit 1
    fi
    echo -e "${YELLOW}Waiting for PostgreSQL to be ready... ($ELAPSED seconds elapsed)${NC}"
    sleep 2
    ELAPSED=$((ELAPSED+2))
done

# Import seed data
echo -e "${YELLOW}Importing seed data...${NC}"
docker exec -i $CONTAINER_NAME psql -U postgres -d docmcp < seed/backup_2025-04-23T09-15-41-150Z.sql

echo -e "${GREEN}Test environment is ready!${NC}"
echo -e "${GREEN}Test PostgreSQL is running on port 5434${NC}"
echo -e "${YELLOW}To stop the test environment, run: docker-compose -f docker-compose.test.yml down -v${NC}"
echo -e "${YELLOW}Note: The -v flag will remove the test volume when stopping${NC}" 
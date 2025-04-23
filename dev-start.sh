#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting DocMCP development environment...${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Start PostgreSQL container with docker-compose.dev.yml
echo -e "${YELLOW}Starting PostgreSQL container...${NC}"
docker-compose -f docker-compose.dev.yml up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
sleep 5

# Get the actual container name
CONTAINER_NAME=$(docker ps --filter "name=docmcp-postgres" --format "{{.Names}}")

if [ -z "$CONTAINER_NAME" ]; then
    echo -e "${RED}Could not find PostgreSQL container. Please check if it started correctly.${NC}"
    exit 1
fi

echo -e "${YELLOW}Found PostgreSQL container: ${CONTAINER_NAME}${NC}"

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

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
npx prisma migrate deploy

npm run build

echo -e "${GREEN}Development environment is ready!${NC}"
echo -e "${GREEN}PostgreSQL is running on port 5433${NC}"
echo -e "${YELLOW}To stop the environment, run: docker-compose -f docker-compose.dev.yml down${NC}" 
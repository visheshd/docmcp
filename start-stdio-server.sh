#!/bin/bash

# Set DATABASE_URL environment variable for local development
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/docmcp"

# Start the stdio server
echo "Starting stdio-server..."
npx tsx src/stdio-server.ts 
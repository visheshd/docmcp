#!/bin/bash
set -e

# Change to the project directory
cd "$(dirname "$0")"

# Load environment variables from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Run the server
node dist/stdio-server.js 
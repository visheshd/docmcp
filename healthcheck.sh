#!/bin/sh
set -e

# Healthcheck script for DocMCP application container

# Get app port from environment or default to 1337
PORT=${PORT:-1337}

# Check if the application is accessible
HTTP_RESPONSE=$(wget --no-verbose --tries=1 --spider --timeout=5 http://localhost:${PORT}/health 2>&1)
HTTP_STATUS=$?

# Check database connectivity 
DB_RESPONSE=$(nc -z postgres 5432 2>&1)
DB_STATUS=$?

# Report status
if [ $HTTP_STATUS -ne 0 ]; then
  echo "ERROR: Application health check failed!"
  echo $HTTP_RESPONSE
  exit 1
fi

if [ $DB_STATUS -ne 0 ]; then
  echo "ERROR: Database connectivity check failed!"
  echo $DB_RESPONSE
  exit 1
fi

echo "Health check passed: Application and database are both healthy"
exit 0 
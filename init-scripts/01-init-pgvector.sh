#!/bin/bash
set -e

# Run this as the postgres user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Create the pgvector extension if it doesn't exist
  CREATE EXTENSION IF NOT EXISTS vector;
  
  -- Set appropriate permissions
  GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;
EOSQL

echo "PostgreSQL initialized with pgvector extension" 
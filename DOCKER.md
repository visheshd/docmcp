# Docker Deployment Guide for DocMCP

This guide provides detailed instructions for deploying the DocMCP (Documentation Management and Processing System) using Docker.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Configuration Options](#configuration-options)
- [Development Deployment](#development-deployment)
- [Production Deployment](#production-deployment)
- [Container Management](#container-management)
- [Accessing Logs](#accessing-logs)
- [Health Monitoring](#health-monitoring)
- [Database Management](#database-management)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying DocMCP with Docker, ensure you have the following:

- Docker Engine (version 19.03 or later)
- Docker Compose (version 1.27 or later)
- At least 2GB of RAM available for the containers
- At least 10GB of disk space for database and document storage

## Configuration Options

### Environment Variables

The following environment variables can be configured in the `.env` file:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `POSTGRES_USER` | PostgreSQL database username | postgres |
| `POSTGRES_PASSWORD` | PostgreSQL database password | postgres |
| `POSTGRES_DB` | PostgreSQL database name | docmcp |
| `POSTGRES_PORT` | Host port for PostgreSQL | 5433 |
| `PORT` | Port for the DocMCP API | 1337 |
| `NODE_ENV` | Application environment | production |
| `LOG_LEVEL` | Logging verbosity | info |
| `CORS_ORIGIN` | CORS allowed origins | * |

### Directory Structure

The Docker setup uses the following volume mappings:

- `postgres_data`: Persistent storage for PostgreSQL data
- `app_data`: Persistent storage for application data
- `app_logs`: Storage for application logs
- `./logs:/app/logs`: Mapping of host logs directory to container logs
- `./init-scripts:/docker-entrypoint-initdb.d`: Database initialization scripts

## Development Deployment

For development purposes, use the standard Docker Compose configuration:

```bash
# Start containers
./docker-start.sh

# Stop containers
./docker-stop.sh

# View logs
docker-compose logs -f
```

## Production Deployment

For production deployments, use the production-optimized configuration:

```bash
# Start containers in production mode
./docker-start-prod.sh

# Stop containers
./docker-stop-prod.sh

# View production logs
docker-compose -f docker-compose.prod.yml logs -f
```

The production configuration includes:

- Resource limits for containers
- Enhanced logging configuration
- Environment variable validation
- Optimized PostgreSQL settings
- Health monitoring

## Container Management

### Restarting Services

To restart all services:

```bash
# Development mode
./docker-restart.sh

# Production mode
./docker-restart.sh prod
```

### Rebuilding Containers

If you need to rebuild the containers after code changes:

```bash
# Development
docker-compose build --no-cache
docker-compose up -d

# Production
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

## Accessing Logs

### Application Logs

View application logs:

```bash
# All logs
docker-compose logs -f app

# Only error logs
docker-compose logs -f app | grep ERROR
```

Logs are also available in the `./logs` directory on the host.

### Database Logs

View PostgreSQL logs:

```bash
docker-compose logs -f postgres
```

## Health Monitoring

The Docker setup includes health checks for all services:

- The API server is checked with `healthcheck.sh` at `/health` endpoint
- The PostgreSQL database is checked with `pg_isready`

You can verify the health status with:

```bash
docker-compose ps
```

Healthy services will show `(healthy)` in the status column.

## Database Management

### Backups

Create a database backup:

```bash
docker-compose exec postgres pg_dump -U postgres -d docmcp > backup_$(date +%Y-%m-%d_%H-%M-%S).sql
```

### Restoration

Restore a database from backup:

```bash
# Stop the services
./docker-stop.sh

# Start only the database
docker-compose up -d postgres

# Wait for the database to be ready
sleep 10

# Restore the backup
cat your_backup_file.sql | docker-compose exec -T postgres psql -U postgres -d docmcp

# Start all services
docker-compose up -d
```

### Accessing the Database

Connect to the PostgreSQL database:

```bash
docker-compose exec postgres psql -U postgres -d docmcp
```

## Troubleshooting

### Common Issues

#### Container Won't Start

Check the container logs:

```bash
docker-compose logs app
```

Verify if PostgreSQL is running:

```bash
docker-compose ps postgres
```

#### Database Connection Issues

1. Ensure the database container is running:
   ```bash
   docker-compose ps postgres
   ```

2. Verify database connection settings in the `.env` file.

3. Check if the PostgreSQL port is accessible:
   ```bash
   telnet localhost 5433
   ```

#### Out of Memory Errors

If you see out of memory errors in the logs:

1. Increase the memory limits in `docker-compose.prod.yml`.
2. Ensure your host has enough available memory.

#### Slow Performance

1. Check the CPU and memory usage:
   ```bash
   docker stats
   ```

2. Consider increasing resource limits in the Docker Compose file.

3. For database performance issues, you might need to optimize PostgreSQL settings. 
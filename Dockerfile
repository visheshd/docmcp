FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install dependencies using pnpm (detected from lock file)
RUN npm install -g pnpm && \
    pnpm install

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript code
RUN pnpm run build

# Production image
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Set NODE_ENV to production
ENV NODE_ENV=production

# Install production dependencies only
RUN npm install -g pnpm && \
    pnpm install --prod && \
    # Install additional utilities for health checks and debugging
    apk add --no-cache wget curl netcat-openbsd

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma

# Copy healthcheck script and make it executable
COPY healthcheck.sh /app/healthcheck.sh
RUN chmod +x /app/healthcheck.sh

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create log directory
RUN mkdir -p /app/logs && \
    touch /app/logs/app.log

# Create a non-root user to run the app
RUN addgroup -S appuser && adduser -S appuser -G appuser && \
    chown -R appuser:appuser /app/logs
USER appuser

# Expose API port
EXPOSE 1337

# Advanced health check using our script
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD /app/healthcheck.sh

# Use our entrypoint script
ENTRYPOINT ["/app/docker-entrypoint.sh"] 
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
    pnpm install --prod

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma

# Create a non-root user to run the app
RUN addgroup -S appuser && adduser -S appuser -G appuser
USER appuser

# Expose API port
EXPOSE 1337

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:1337/health || exit 1

# Command to run the application
CMD ["node", "dist/index.js"] 
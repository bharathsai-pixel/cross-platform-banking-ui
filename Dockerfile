# =============================================================================
# NexusPay Banking API - Dockerfile
# Multi-stage build for optimized production image
# =============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nexuspay && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G nexuspay -g nexuspay nexuspay

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and production dependencies only
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate && \
    pnpm install --prod --frozen-lockfile && \
    pnpm store prune

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

# Set ownership to non-root user
RUN chown -R nexuspay:nexuspay /app

# Switch to non-root user
USER nexuspay

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "dist/index.js"]

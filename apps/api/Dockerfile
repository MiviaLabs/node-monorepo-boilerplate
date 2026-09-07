# =============================================================================
# Production-ready Dockerfile for NestJS API
# =============================================================================
#
# Features:
# - Multi-stage build for smaller image size
# - Node.js 24 Alpine base image
# - pnpm workspace support
# - Non-root user for security
# - Health check endpoint
# - Proper layer caching for faster builds
#
# Build: docker build -t nestjs-api:latest -f apps/api/Dockerfile .
# Run:   docker run -p 3000:3000 --env-file .env nestjs-api:latest
#
# =============================================================================

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:24-alpine AS deps

# Install pnpm using npm (more reliable in Docker)
RUN npm install -g pnpm@10.29.3

# Set working directory for the monorepo root
WORKDIR /app

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc nx.json tsconfig.base.json ./

# Copy all workspace package.json and project.json files
COPY packages/types/package.json packages/types/project.json ./packages/types/
COPY packages/utils/package.json packages/utils/project.json ./packages/utils/
COPY packages/schema/package.json packages/schema/project.json ./packages/schema/
COPY packages/constants/package.json packages/constants/project.json ./packages/constants/
COPY packages/errors/package.json packages/errors/project.json ./packages/errors/
COPY packages/i18n/package.json packages/i18n/project.json ./packages/i18n/
COPY packages/test-utils/package.json packages/test-utils/project.json ./packages/test-utils/
COPY packages/db-core/package.json packages/db-core/project.json ./packages/db-core/
COPY packages/db-outbox/package.json packages/db-outbox/project.json ./packages/db-outbox/
COPY packages/redis/package.json packages/redis/project.json ./packages/redis/
COPY packages/storage/package.json packages/storage/project.json ./packages/storage/
COPY packages/events/package.json packages/events/project.json ./packages/events/
COPY packages/queues/package.json packages/queues/project.json ./packages/queues/
COPY packages/encryption/package.json packages/encryption/project.json ./packages/encryption/
COPY packages/auth/package.json packages/auth/project.json ./packages/auth/
COPY packages/observability/package.json packages/observability/project.json ./packages/observability/
COPY packages/core/package.json packages/core/project.json ./packages/core/
COPY packages/secrets/package.json packages/secrets/project.json ./packages/secrets/
COPY packages/tasks/package.json packages/tasks/project.json ./packages/tasks/
COPY packages/pubsub/package.json packages/pubsub/project.json ./packages/pubsub/
COPY packages/opa/package.json packages/opa/project.json ./packages/opa/
COPY packages/email/package.json packages/email/project.json ./packages/email/
COPY apps/api/package.json apps/api/project.json ./apps/api/

# Install all dependencies including workspace package dependencies
# Using --frozen-lockfile to ensure reproducible builds
# The lockfile already resolves workspace protocol to concrete versions
RUN pnpm install --frozen-lockfile --prefer-offline

# =============================================================================
# Stage 2: Builder
# =============================================================================
# CRITICAL: Nx cache management in Docker builds
#
# Why we need nx reset here:
# 1. Docker multi-stage builds can cause .nx/cache corruption
# 2. node_modules from deps stage may contain stale Nx cache state
# 3. "Failed to process project graph" error occurs without reset
# 4. nx reset clears corrupted cache and rebuilds project graph cleanly
#
# Key pattern:
# - Copy node_modules from deps (already has all dependencies)
# - Copy workspace config and project.json files
# - Copy source files
# - RUN nx reset to clear any corrupted cache
# - Then run nx build
# =============================================================================
FROM node:24-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@10.29.3

# Install build dependencies
# - python3, make, g++: required for node-gyp (native module compilation)
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy dependencies from deps stage
# node_modules already contains all dependencies with workspace links from pnpm install
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json types.d.ts .eslintrc.js eslint-local-rules.js ./
COPY tools/eslint ./tools/eslint
COPY tools/eslint-rules ./tools/eslint-rules

# Copy all project.json files (needed for Nx project graph)
COPY packages/types/project.json ./packages/types/
COPY packages/utils/project.json ./packages/utils/
COPY packages/schema/project.json ./packages/schema/
COPY packages/constants/project.json ./packages/constants/
COPY packages/errors/project.json ./packages/errors/
COPY packages/i18n/project.json ./packages/i18n/
COPY packages/test-utils/project.json ./packages/test-utils/
COPY packages/db-core/project.json ./packages/db-core/
COPY packages/db-outbox/project.json ./packages/db-outbox/
COPY packages/redis/project.json ./packages/redis/
COPY packages/storage/project.json ./packages/storage/
COPY packages/events/project.json ./packages/events/
COPY packages/queues/project.json ./packages/queues/
COPY packages/encryption/project.json ./packages/encryption/
COPY packages/auth/project.json ./packages/auth/
COPY packages/observability/project.json ./packages/observability/
COPY packages/core/project.json ./packages/core/
COPY packages/secrets/project.json ./packages/secrets/
COPY packages/tasks/project.json ./packages/tasks/
COPY packages/pubsub/project.json ./packages/pubsub/
COPY packages/opa/project.json ./packages/opa/
COPY apps/api/project.json ./apps/api/

# Copy all source files
COPY packages ./packages
COPY apps/api ./apps/api

# Reset Nx cache before build
# Docker builds can corrupt .nx/cache - this clears it and rebuilds project graph
RUN npx nx reset

# Build using Nx
# nx is available via node_modules from deps stage
RUN pnpm nx build api --configuration=production

# =============================================================================
# Stage 3: Production Runner
# =============================================================================
FROM node:24-alpine AS runner

# Install dumb-init for proper signal handling and zombie process reaping
# Install postgresql-client for database readiness checks
# Install jq for JSON parsing (required by secrets loader script)
# Install curl/unzip/gcompat for 1Password CLI installation
RUN apk add --no-cache dumb-init postgresql-client jq curl unzip gcompat

# Install 1Password CLI (op) for runtime secrets loading
RUN OP_VERSION="v2.29.0" && \
    curl -sSfLo /tmp/op.zip "https://cache.agilebits.com/dist/1P/op2/pkg/${OP_VERSION}/op_linux_amd64_v2.29.0.zip" && \
    unzip /tmp/op.zip -d /tmp && \
    mv /tmp/op /usr/local/bin/op && \
    chmod +x /usr/local/bin/op && \
    rm -f /tmp/op.zip /tmp/op && \
    op --version

# Create non-root user for security (following principle of least privilege)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Set working directory
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy node_modules from builder (includes all runtime dependencies like tslib)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/dist/apps/api ./dist/apps/api

# Copy workspace module builds (required for monorepo dependencies)
COPY --from=builder /app/dist/packages ./dist/packages

# Copy source packages (needed for runtime resolution)
COPY --from=builder /app/packages ./packages

# Copy API source and scripts required for operational runtime commands
COPY --from=builder /app/apps/api/src ./apps/api/src
COPY --from=builder /app/apps/api/scripts ./apps/api/scripts
COPY --from=builder /app/apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY --from=builder /app/apps/api/tsconfig.app.json ./apps/api/tsconfig.app.json
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json

# Copy migration scripts
COPY --from=builder /app/packages/db-core/drizzle ./packages/db-core/drizzle
COPY --from=builder /app/packages/db-outbox/drizzle ./packages/db-outbox/drizzle

# Copy entrypoint script for database migrations and startup
COPY apps/api/entrypoint.sh ./entrypoint.sh
COPY scripts/ops/seed-system-user.sh ./scripts/ops/seed-system-user.sh

# Copy 1Password secrets loader script
COPY scripts/load-1password-secrets.sh ./scripts/load-1password-secrets.sh

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app

# Make scripts executable
RUN chmod +x ./entrypoint.sh ./scripts/load-1password-secrets.sh ./scripts/ops/seed-system-user.sh

# Switch to non-root user
USER nestjs

# Expose application port (default NestJS port)
EXPOSE 3000

# Health check endpoint
# The API serves health checks at /api/{version}/health
# Using default version v1 for health check
# Interval: 30s, Timeout: 10s, Start period: 40s, Retries: 3
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/v1/ops/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Use dumb-init to handle signals properly (SIGTERM, SIGINT, etc.)
ENTRYPOINT ["dumb-init", "--"]

# Run entrypoint script which handles migrations and starts the app
CMD ["./entrypoint.sh"]

# =============================================================================
# Production-ready Dockerfile for Next.js Web App
# =============================================================================
#
# Features:
# - Multi-stage build for smaller image size
# - Node.js 24 Alpine base image
# - pnpm workspace support
# - Standalone output for optimized production builds
# - Non-root user for security
# - Health check endpoint
# - Proper layer caching for faster builds
# - 1Password secrets loading support
#
# Build: docker build -t web:latest .
# Run:   docker run -p 3001:3001 --env-file .env web:latest
#
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:24-alpine AS deps

# Install pnpm using npm (more reliable in Docker)
RUN npm install -g pnpm@10.29.3 && pnpm --version

# Set working directory
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
COPY apps/api/package.json apps/api/project.json ./apps/api/
COPY apps/web/package.json apps/web/project.json ./apps/web/

# Install all dependencies including workspace package dependencies
# Using --frozen-lockfile to ensure reproducible builds
# The lockfile already resolves workspace protocol to concrete versions
RUN pnpm install --frozen-lockfile --prefer-offline

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
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
# -----------------------------------------------------------------------------
FROM node:24-alpine AS builder

# Install pnpm using npm (more reliable in Docker)
RUN npm install -g pnpm@10.29.3 && pnpm --version

# Set working directory
WORKDIR /app

# Build arguments for configuration
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Copy dependencies from deps stage
# node_modules already contains all dependencies with workspace links from pnpm install
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace configuration files
COPY package.json pnpm-workspace.yaml nx.json tsconfig.base.json types.d.ts .eslintrc.js eslint-local-rules.js ./
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
COPY apps/web/project.json ./apps/web/

# Copy source code (only what's needed for build)
COPY packages ./packages
COPY apps/web ./apps/web
COPY apps/api/src ./apps/api/src

# Build the Next.js application directly.
# This avoids the flaky Nx plugin worker path and matches the active local build target.
# NOTE: --webpack remains required due to Next.js 16 + Turbopack instability in this repo.
RUN pnpm --dir apps/web exec next build --webpack

# -----------------------------------------------------------------------------
# Stage 3: Production Runner
# -----------------------------------------------------------------------------
FROM node:24-alpine AS runner

# Install pnpm using npm (more reliable in Docker)
RUN npm install -g pnpm@10.29.3 && pnpm --version

# Install jq for runtime secrets loading.
RUN apk add --no-cache jq

# Install 1Password CLI by default because the runtime entrypoint supports
# OP-enabled secret loading out of the box. Opt out explicitly with:
#   docker build --build-arg INSTALL_OP=false ...
ARG INSTALL_OP=true
RUN if [ "$INSTALL_OP" = "true" ]; then \
      apk add --no-cache curl unzip gcompat && \
      OP_VERSION="v2.29.0" && \
      curl -sSfLo /tmp/op.zip "https://cache.agilebits.com/dist/1P/op2/pkg/${OP_VERSION}/op_linux_amd64_v2.29.0.zip" && \
      unzip /tmp/op.zip -d /tmp && \
      mv /tmp/op /usr/local/bin/op && \
      chmod +x /usr/local/bin/op && \
      rm -f /tmp/op.zip /tmp/op && \
      op --version; \
    fi && \
    jq --version

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

# Environment variables (will be provided at runtime)
# NODE_ENV, PORT, and HOSTNAME should be set via docker run -e or docker-compose env_file
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy necessary files from builder for Next.js standalone output
# Note: Next.js standalone output structure:
# - standalone/node_modules (dependencies)
# - standalone/apps/web/.next (server files)
# - standalone/apps/web/server.js (entry point)
# We copy to apps/web/ and run from there since server.js uses __dirname
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/apps/web/server.js ./apps/web/server.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Copy entrypoint script
COPY --chown=nextjs:nodejs apps/web/entrypoint.sh ./entrypoint.sh

# Copy 1Password secrets loader script
COPY --chown=nextjs:nodejs scripts/load-1password-secrets.sh ./scripts/load-1password-secrets.sh

RUN chmod +x ./entrypoint.sh ./scripts/load-1password-secrets.sh

# Switch to non-root user
USER nextjs

# Expose the application port (Web app runs on port 3001)
EXPOSE 3001

# Health check - Next.js should respond to root path
# Interval: 30s, Timeout: 10s, Start period: 40s, Retries: 3
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })" || exit 1

# Use entrypoint script
ENTRYPOINT ["./entrypoint.sh"]

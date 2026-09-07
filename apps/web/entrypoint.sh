#!/bin/sh
set -e

# Load 1Password secrets if enabled (optional)
if [ -f "/app/scripts/load-1password-secrets.sh" ]; then
  . /app/scripts/load-1password-secrets.sh
fi

# Set default values if not provided
export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-3001}
export HOSTNAME=${HOSTNAME:-0.0.0.0}

# Disable Next.js telemetry
export NEXT_TELEMETRY_DISABLED=1

# Start the Next.js application from apps/web directory
# server.js uses __dirname to find .next, so we must run from the same directory
echo "Starting Next.js application on ${HOSTNAME}:${PORT}..."
echo "NODE_ENV=${NODE_ENV}"
cd apps/web && exec node server.js


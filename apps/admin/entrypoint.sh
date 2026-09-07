#!/bin/sh
set -e

if [ -f "/app/scripts/load-1password-secrets.sh" ]; then
  . /app/scripts/load-1password-secrets.sh
fi

export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-3002}
export HOSTNAME=${ADMIN_HOSTNAME:-0.0.0.0}
export NEXT_TELEMETRY_DISABLED=1

echo "Starting Admin application on ${HOSTNAME}:${PORT}..."
echo "NODE_ENV=${NODE_ENV}"

cd /app/apps/admin
exec node server.js

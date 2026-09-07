#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR/apps/api"
exec pnpm exec tsx scripts/seed-system-user.ts "$@"

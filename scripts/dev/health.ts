#!/usr/bin/env tsx
/**
 * Development environment health check
 */

import { execSync } from 'child_process';

// Configuration constants
const CHECK_TIMEOUT_MS = 5000 as const; // Individual check timeout
const OVERALL_TIMEOUT_MS = 15000 as const; // Overall health check timeout

// Container names (configurable via environment)
const CONTAINERS = {
  postgres: process.env.POSTGRES_CONTAINER || 'mivialabs-postgres-dev',
  redis: process.env.REDIS_CONTAINER || 'mivialabs-redis-dev',
  rabbitmq: process.env.RABBITMQ_CONTAINER || 'mivialabs-rabbitmq-dev'
} as const;

interface HealthCheck {
  name: string;
  container: keyof typeof CONTAINERS;
  check: () => Promise<boolean>;
  critical: boolean;
}

const checks: HealthCheck[] = [
  {
    name: 'PostgreSQL',
    container: 'postgres',
    check: async () => {
      try {
        const cmd = `docker exec ${CONTAINERS.postgres} pg_isready -U starter -d starter_db`;
        execSync(cmd, { stdio: 'pipe', timeout: CHECK_TIMEOUT_MS });
        return true;
      } catch {
        return false;
      }
    },
    critical: true
  },
  {
    name: 'Redis',
    container: 'redis',
    check: async () => {
      try {
        const cmd = `docker exec ${CONTAINERS.redis} redis-cli ping`;
        execSync(cmd, { stdio: 'pipe', timeout: CHECK_TIMEOUT_MS });
        return true;
      } catch {
        return false;
      }
    },
    critical: true
  },
  {
    name: 'RabbitMQ',
    container: 'rabbitmq',
    check: async () => {
      try {
        const cmd = `docker exec ${CONTAINERS.rabbitmq} rabbitmq-diagnostics ping`;
        execSync(cmd, { stdio: 'pipe', timeout: CHECK_TIMEOUT_MS });
        return true;
      } catch {
        return false;
      }
    },
    critical: false
  }
];

async function runHealthChecks(): Promise<void> {
  console.log('Running development environment health checks...\n');

  // Add overall timeout to prevent indefinite hanging
  const timeoutPromise = new Promise<never>((_reject) => {
    setTimeout(() => {
      throw new Error(`Health check timeout after ${OVERALL_TIMEOUT_MS}ms`);
    }, OVERALL_TIMEOUT_MS);
  });

  try {
    await Promise.race([runChecks(), timeoutPromise]);
  } catch (error) {
    console.error(
      `\n✗ Health check failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

async function runChecks(): Promise<void> {
  let allPassed = true;

  for (const check of checks) {
    const status = await check.check();
    const icon = status ? '✓' : '✗';
    const critical = check.critical ? ' [CRITICAL]' : '';
    const container = CONTAINERS[check.container];
    console.log(`${icon} ${check.name} (${container})${critical}`);

    if (!status && check.critical) {
      allPassed = false;
    }
  }

  console.log();

  if (allPassed) {
    console.log('✓ All critical services are healthy!');
    process.exit(0);
  } else {
    console.log('✗ Some critical services are unhealthy.');
    console.log('  Run `pnpm dev:start` to start them.');
    console.log(`  Or set container names via environment variables:`);
    console.log(`    POSTGRES_CONTAINER, REDIS_CONTAINER, RABBITMQ_CONTAINER`);
    process.exit(1);
  }
}

void runHealthChecks().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

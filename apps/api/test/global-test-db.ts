/**
 * Global Test Database Manager
 *
 * Starts Testcontainers PostgreSQL ONCE before all E2E tests.
 * Runs as a standalone daemon process and writes connection details to disk.
 *
 * This solves the issue where node:test runs each test file in a separate process,
 * which would otherwise cause Testcontainers to start/stop for each file.
 *
 * The daemon mode starts the database in the background and exits immediately,
 * allowing the test runner to continue. The database is stopped by reading the PID.
 *
 * @packageDocumentation
 */

/* eslint-disable no-console, @typescript-eslint/no-unsafe-call */
import { spawn } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { unlink } from 'fs/promises';
import { resolve } from 'path';

const CONNECTION_FILE = resolve(process.cwd(), '.test-db-connection.json');
const PID_FILE = resolve(process.cwd(), '.test-db.pid');

// Helper to safely unlink a file
async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // File doesn't exist, ignore
  }
}

/**
 * Start the database in daemon mode (background)
 * This spawns a detached child process that keeps the database alive
 */
async function startDaemon(): Promise<void> {
  // Check if already running
  if (existsSync(CONNECTION_FILE)) {
    const existingPid = existsSync(PID_FILE) ? readFileSync(PID_FILE, 'utf-8') : null;
    if (existingPid) {
      try {
        // Check if process is still running
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        process.kill(parseInt(existingPid, 10), 0);
        console.log('Test database is already running (PID: ' + existingPid + ')');
        console.log('Connection details:');
        console.log(JSON.parse(readFileSync(CONNECTION_FILE, 'utf-8')));
        return;
      } catch {
        // Process not running, clean up stale files
        await safeUnlink(CONNECTION_FILE);
        await safeUnlink(PID_FILE);
      }
    }
  }

  // Configure timeout based on environment
  // In CI, Testcontainers can take longer to start due to resource constraints
  const isCI = process.env['CI'] === 'true' || process.env['GITHUB_ACTIONS'] === 'true';
  const defaultTimeout = isCI ? 180000 : 60000; // 3 minutes in CI, 1 minute locally
  const timeoutMs = parseInt(process.env['TEST_DB_DAEMON_TIMEOUT'] ?? String(defaultTimeout), 10);

  console.log('Starting global test database in daemon mode...');
  console.log(`Timeout set to ${timeoutMs}ms (${timeoutMs / 1000}s)`);

  // Spawn the daemon process directly using npx tsx
  // This works with both CommonJS and ESM projects
  const daemon = spawn('npx', ['tsx', __filename, 'daemon'], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    shell: false,
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });

  daemon.unref();

  // Wait for daemon to report ready state or error
  await new Promise<void>((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      daemon.kill();
      reject(new Error(`Daemon startup timeout after ${timeoutMs}ms.`));
    }, timeoutMs);

    daemon.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn daemon: ${err.message}`));
    });

    daemon.on('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Daemon exited with code ${code}. Signal: ${signal}.`));
      }
    });

    // Wait for connection file to be created
    const checkInterval = setInterval(() => {
      if (existsSync(CONNECTION_FILE)) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        const details = JSON.parse(readFileSync(CONNECTION_FILE, 'utf-8'));
        console.log('Test database started successfully!');
        console.log(
          'Connection URL:',
          details.databases?.main?.connectionUrl ?? details.connectionUrl
        );
        console.log('Daemon PID:', details.pid);
        resolvePromise();
      }
    }, 500);
  });
}

/**
 * Daemon process - runs in the background keeping the database alive
 *
 * CRITICAL: Uses a SINGLE PostgreSQL database for BOTH main and events migrations.
 * This is required for the outbox pattern to work correctly, as transactions must
 * span both main tables (users, organizations, etc.) and events tables (outbox).
 * PostgreSQL transactions cannot span across different database instances.
 */
async function runDaemon(): Promise<void> {
  // Lazy load test-utils to comply with Nx module boundaries
  const {
    startPostgresContainer,
    stopPostgresContainer,
    getPostgresConnectionUrl,
    getPostgresSuperuserUrl,
    startRedisContainer,
    stopRedisContainer,
    getRedisConnectionEnvVars,
    startKafkaContainer,
    stopKafkaContainer,
    getKafkaConnectionEnvVars
  } = await import('@package/test-utils');

  // Start SINGLE PostgreSQL Testcontainers for BOTH main and events migrations
  console.log('Daemon: Starting PostgreSQL container (main + events migrations)...');
  await startPostgresContainer('main', { database: 'test_e2e' });
  const connectionUrl = getPostgresConnectionUrl('main');
  const superuserUrl = getPostgresSuperuserUrl('main');

  // Start Redis Testcontainers
  console.log('Daemon: Starting Redis container...');
  await startRedisContainer('redis');
  const redisEnvVars = getRedisConnectionEnvVars('redis');
  console.log('Daemon: Redis container started:', {
    host: redisEnvVars.REDIS_HOST,
    port: redisEnvVars.REDIS_PORT,
    db: redisEnvVars.REDIS_DB
  });

  // Start Kafka Testcontainers
  console.log('Daemon: Starting Kafka container...');
  await startKafkaContainer('kafka');
  const kafkaEnvVars = getKafkaConnectionEnvVars('kafka');
  console.log('Daemon: Kafka container started:', {
    broker: kafkaEnvVars.KAFKA_BROKER
  });

  // Write connection details to temp file
  // CRITICAL: Both main and events point to the SAME database
  const connectionDetails = {
    databases: {
      main: {
        connectionUrl,
        superuserUrl
      },
      events: {
        connectionUrl, // SAME as main
        superuserUrl // SAME as main
      }
    },
    redis: {
      host: redisEnvVars.REDIS_HOST,
      port: redisEnvVars.REDIS_PORT,
      password: redisEnvVars.REDIS_PASSWORD,
      db: redisEnvVars.REDIS_DB
    },
    kafka: {
      broker: kafkaEnvVars.KAFKA_BROKER,
      brokers: kafkaEnvVars.KAFKA_BROKERS
    },
    startedAt: new Date().toISOString(),
    pid: process.pid
  };
  writeFileSync(CONNECTION_FILE, JSON.stringify(connectionDetails, null, 2), 'utf-8');
  writeFileSync(PID_FILE, String(process.pid), 'utf-8');

  console.log('Test database daemon started (PID: ' + process.pid + ')');

  // Handle graceful shutdown signals
  const shutdownHandler = (): void => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      console.log('Daemon: Shutting down test database...');

      try {
        console.log('Daemon: Shutting down PostgreSQL...');
        await stopPostgresContainer(); // Stop the single container
        console.log('Daemon: PostgreSQL stopped');
      } catch (error) {
        if ((error as Error).message.includes('No running container found')) {
          console.log('Daemon: No PostgreSQL container was running');
        } else {
          console.error('Daemon: Error stopping PostgreSQL:', error);
        }
      }

      try {
        console.log('Daemon: Shutting down Redis...');
        await stopRedisContainer('redis');
        console.log('Daemon: Redis stopped');
      } catch (error) {
        if ((error as Error).message.includes('No running container found')) {
          console.log('Daemon: No Redis container was running');
        } else {
          console.error('Daemon: Error stopping Redis:', error);
        }
      }

      try {
        console.log('Daemon: Shutting down Kafka...');
        await stopKafkaContainer('kafka');
        console.log('Daemon: Kafka stopped');
      } catch (error) {
        if ((error as Error).message.includes('No running container found')) {
          console.log('Daemon: No Kafka container was running');
        } else {
          console.error('Daemon: Error stopping Kafka:', error);
        }
      }

      await safeUnlink(CONNECTION_FILE);
      await safeUnlink(PID_FILE);

      console.log('Daemon: Test database stopped');
      process.exit(0);
    })();
  };

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.on('SIGINT', shutdownHandler);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.on('SIGTERM', shutdownHandler);

  // Keep process alive: a pending Promise alone does not keep Node's event loop running.
  await new Promise<void>(() => {
    setInterval(() => {
      // no-op heartbeat to keep daemon alive
    }, 60_000);
  });
}

/**
 * Start the database in foreground mode (interactive)
 * This is for manual use when you want to see logs and stop with Ctrl+C
 *
 * CRITICAL: Uses a SINGLE PostgreSQL database for BOTH main and events migrations.
 * This is required for the outbox pattern to work correctly.
 */
async function startInteractive(): Promise<void> {
  // Lazy load test-utils to comply with Nx module boundaries
  const {
    startPostgresContainer,
    getPostgresConnectionUrl,
    getPostgresSuperuserUrl,
    startRedisContainer,
    getRedisConnectionEnvVars,
    startKafkaContainer,
    getKafkaConnectionEnvVars
  } = await import('@package/test-utils');

  // Check if already running
  if (existsSync(CONNECTION_FILE)) {
    const existingPid = existsSync(PID_FILE) ? readFileSync(PID_FILE, 'utf-8') : null;
    if (existingPid) {
      try {
        // Check if process is still running
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        process.kill(parseInt(existingPid, 10), 0);
        console.log('Test database is already running (PID: ' + existingPid + ')');
        console.log('Connection details:');
        console.log(JSON.parse(readFileSync(CONNECTION_FILE, 'utf-8')));
        console.log('\nTo stop the running database, use: node global-test-db.ts stop');
        return;
      } catch {
        // Process not running, clean up stale files
        await safeUnlink(CONNECTION_FILE);
        await safeUnlink(PID_FILE);
      }
    }
  }

  console.log('Starting global test database in interactive mode...');

  // Start SINGLE PostgreSQL Testcontainers for BOTH main and events migrations
  console.log('Starting PostgreSQL container (main + events migrations)...');
  await startPostgresContainer('main', { database: 'test_e2e' });
  const connectionUrl = getPostgresConnectionUrl('main');
  const superuserUrl = getPostgresSuperuserUrl('main');

  // Start Redis Testcontainers
  console.log('Starting Redis container...');
  await startRedisContainer('redis');
  const redisEnvVars = getRedisConnectionEnvVars('redis');
  console.log('Redis container started:', {
    host: redisEnvVars.REDIS_HOST,
    port: redisEnvVars.REDIS_PORT,
    db: redisEnvVars.REDIS_DB
  });

  // Start Kafka Testcontainers
  console.log('Starting Kafka container...');
  await startKafkaContainer('kafka');
  const kafkaEnvVars = getKafkaConnectionEnvVars('kafka');
  console.log('Kafka container started:', {
    broker: kafkaEnvVars.KAFKA_BROKER
  });

  // Write connection details to temp file
  // CRITICAL: Both main and events point to the SAME database
  const connectionDetails = {
    databases: {
      main: {
        connectionUrl,
        superuserUrl
      },
      events: {
        connectionUrl, // SAME as main
        superuserUrl // SAME as main
      }
    },
    redis: {
      host: redisEnvVars.REDIS_HOST,
      port: redisEnvVars.REDIS_PORT,
      password: redisEnvVars.REDIS_PASSWORD,
      db: redisEnvVars.REDIS_DB
    },
    kafka: {
      broker: kafkaEnvVars.KAFKA_BROKER,
      brokers: kafkaEnvVars.KAFKA_BROKERS
    },
    startedAt: new Date().toISOString(),
    pid: process.pid
  };
  writeFileSync(CONNECTION_FILE, JSON.stringify(connectionDetails, null, 2), 'utf-8');
  writeFileSync(PID_FILE, String(process.pid), 'utf-8');

  console.log('Test database started successfully!');
  console.log(`PostgreSQL (main + events): ${connectionUrl}`);
  console.log(`Redis: ${redisEnvVars.REDIS_HOST}:${redisEnvVars.REDIS_PORT}`);
  console.log(`Kafka: ${kafkaEnvVars.KAFKA_BROKER}`);
  console.log(`\nPress Ctrl+C to stop the database\n`);

  // Handle graceful shutdown
  const shutdownHandler = (): void => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      console.log('\nShutting down test database...');
      await stop();
    })();
  };

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.on('SIGINT', shutdownHandler);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.on('SIGTERM', shutdownHandler);

  // Keep process alive: a pending Promise alone does not keep Node's event loop running.
  await new Promise<void>(() => {
    setInterval(() => {
      // no-op heartbeat to keep interactive mode alive
    }, 60_000);
  });
}

async function stop(): Promise<void> {
  // Lazy load test-utils to comply with Nx module boundaries
  const { stopPostgresContainer, stopRedisContainer, stopKafkaContainer } =
    await import('@package/test-utils');

  console.log('Stopping global test database...');

  try {
    console.log('Stopping PostgreSQL...');
    await stopPostgresContainer(); // Stop the single container
  } catch (error) {
    if ((error as Error).message.includes('No running container found')) {
      console.log('No PostgreSQL container was running');
    } else {
      throw error;
    }
  }

  try {
    console.log('Stopping Redis...');
    await stopRedisContainer('redis');
    console.log('Redis stopped');
  } catch (error) {
    if ((error as Error).message.includes('No running container found')) {
      console.log('No Redis container was running');
    } else {
      throw error;
    }
  }

  try {
    console.log('Stopping Kafka...');
    await stopKafkaContainer('kafka');
    console.log('Kafka stopped');
  } catch (error) {
    if ((error as Error).message.includes('No running container found')) {
      console.log('No Kafka container was running');
    } else {
      throw error;
    }
  }

  await safeUnlink(CONNECTION_FILE);
  await safeUnlink(PID_FILE);

  console.log('Test database stopped');
  process.exit(0);
}

function status(): void {
  if (!existsSync(CONNECTION_FILE)) {
    console.log('Test database is NOT running');
    process.exit(1);
  }

  const connectionDetails = JSON.parse(readFileSync(CONNECTION_FILE, 'utf-8')) as
    | {
        databases: {
          main: { connectionUrl: string; superuserUrl: string };
          events: { connectionUrl: string; superuserUrl: string };
        };
        startedAt: string;
        redis?: {
          host: string;
          port: string;
          password: string;
          db: string;
        };
        kafka?: {
          broker: string;
          brokers: string;
        };
      }
    // Legacy format for backward compatibility
    | {
        connectionUrl: string;
        superuserUrl?: string;
        startedAt: string;
        redis?: {
          host: string;
          port: string;
          password: string;
          db: string;
        };
      };
  const pid = existsSync(PID_FILE) ? readFileSync(PID_FILE, 'utf-8') : null;

  console.log('Test database status: RUNNING');

  // Support both new and legacy connection file formats
  if ('databases' in connectionDetails) {
    // New format (single database for both main and events)
    const dbUrl = connectionDetails.databases.main.connectionUrl;
    const eventsUrl = connectionDetails.databases.events.connectionUrl;
    const isSameDb = dbUrl === eventsUrl;

    if (isSameDb) {
      console.log(`  PostgreSQL (main + events): ${dbUrl}`);
    } else {
      console.log(`  Main DB: ${dbUrl}`);
      console.log(`  Events DB: ${eventsUrl}`);
    }

    if (connectionDetails.redis) {
      console.log(`  Redis: ${connectionDetails.redis.host}:${connectionDetails.redis.port}`);
    }
    if (connectionDetails.kafka) {
      console.log(`  Kafka: ${connectionDetails.kafka.broker}`);
    }
  } else {
    // Legacy format
    console.log(`  Connection URL: ${connectionDetails.connectionUrl}`);
    if (connectionDetails.redis) {
      console.log(`  Redis: ${connectionDetails.redis.host}:${connectionDetails.redis.port}`);
    }
  }

  console.log(`  Started at: ${connectionDetails.startedAt}`);
  if (pid) {
    console.log(`  PID: ${pid}`);
  }
}

const command = process.argv[2];

if (command === 'daemon') {
  // Run in daemon mode (background process)
  runDaemon().catch((error) => {
    console.error('Daemon: Failed to start test database:', error);
    process.exit(1);
  });
} else if (command === 'start') {
  // Start in daemon mode (default for automated tests)
  startDaemon().catch((error) => {
    console.error('Failed to start test database:', error);
    process.exit(1);
  });
} else if (command === 'start-interactive') {
  // Start in foreground mode (for manual use)
  startInteractive().catch((error) => {
    console.error('Failed to start test database:', error);
    process.exit(1);
  });
} else if (command === 'stop') {
  stop().catch((error) => {
    console.error('Failed to stop test database:', error);
    process.exit(1);
  });
} else if (command === 'status') {
  try {
    status();
  } catch (error: unknown) {
    console.error('Failed to get status:', error);
    process.exit(1);
  }
} else {
  console.log('Usage: node global-test-db.ts [start|start-interactive|stop|status]');
  console.log('');
  console.log('Commands:');
  console.log('  start             - Start the test database in daemon mode (background)');
  console.log('  start-interactive - Start the test database in foreground mode (interactive)');
  console.log('  stop              - Stop the test database');
  console.log('  status            - Check if test database is running');
  process.exit(1);
}

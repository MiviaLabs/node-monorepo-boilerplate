import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pg from 'pg';

const { Pool } = pg;

const workspaceRoot = resolve(process.cwd());
const WEB_E2E_CONNECTION_FILE = resolve(workspaceRoot, 'apps/web-e2e/.test-db-connection.json');
const connectionFileCandidates = [
  resolve(workspaceRoot, '.test-db-connection.json'),
  resolve(workspaceRoot, 'apps/api/.test-db-connection.json')
];
function findConnectionFile() {
  return connectionFileCandidates.find((file) => existsSync(file));
}

let connectionFile = findConnectionFile();

if (!connectionFile) {
  // eslint-disable-next-line no-console
  console.log('[web-e2e] Missing test DB connection file. Starting API test stack...');
  execSync('pnpm --dir apps/api test:e2e:setup', {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });
  connectionFile = findConnectionFile();
}

if (!connectionFile) {
  // eslint-disable-next-line no-console
  console.error(
    `[web-e2e] Missing test DB connection file after setup. Checked: ${connectionFileCandidates.join(
      ', '
    )}.`
  );
  process.exit(1);
}

const parsed = JSON.parse(readFileSync(connectionFile, 'utf-8'));

const databaseUrl = parsed?.databases?.main?.connectionUrl ?? parsed?.connectionUrl;
const eventsDatabaseUrl = parsed?.databases?.events?.connectionUrl ?? databaseUrl;
const redisHost = parsed?.redis?.host ?? 'localhost';
const redisPort = parsed?.redis?.port ?? '6379';
const redisPassword = parsed?.redis?.password ?? '';
const redisDb = parsed?.redis?.db ?? '0';
const kafkaBroker = parsed?.kafka?.broker ?? '';
const kafkaBrokers = parsed?.kafka?.brokers ?? kafkaBroker;

if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.error('[web-e2e] DATABASE_URL missing in .test-db-connection.json');
  process.exit(1);
}

const redisAuth = redisPassword ? `:${redisPassword}@` : '';
const redisUrl = `redis://${redisAuth}${redisHost}:${redisPort}/${redisDb}`;

function buildDatabaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  url.searchParams.delete('schema');
  return url.toString();
}

async function createIsolatedDatabase(superuserConnectionUrl, databaseName) {
  const adminUrl = new URL(superuserConnectionUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.searchParams.delete('schema');

  const pool = new Pool({ connectionString: adminUrl.toString() });
  try {
    const client = await pool.connect();

    try {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

const superuserDatabaseUrl = parsed?.databases?.main?.superuserUrl ?? databaseUrl;
const isolatedDatabaseName = `web_e2e_${Date.now()}_${process.pid}`.replace(/[^a-zA-Z0-9_]/g, '_');
await createIsolatedDatabase(superuserDatabaseUrl, isolatedDatabaseName);

const isolatedDatabaseUrl = buildDatabaseUrl(databaseUrl, isolatedDatabaseName);
const isolatedEventsDatabaseUrl = buildDatabaseUrl(eventsDatabaseUrl, isolatedDatabaseName);

writeFileSync(
  WEB_E2E_CONNECTION_FILE,
  JSON.stringify(
    {
      databases: {
        main: {
          connectionUrl: isolatedDatabaseUrl,
          superuserUrl: buildDatabaseUrl(superuserDatabaseUrl, isolatedDatabaseName)
        },
        events: {
          connectionUrl: isolatedEventsDatabaseUrl,
          superuserUrl: buildDatabaseUrl(superuserDatabaseUrl, isolatedDatabaseName)
        }
      },
      redis: {
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        db: redisDb
      },
      kafka: {
        broker: kafkaBroker,
        brokers: kafkaBrokers
      },
      startedAt: new Date().toISOString(),
      pid: process.pid
    },
    null,
    2
  ),
  'utf-8'
);

const env = {
  ...process.env,
  NODE_ENV: 'test',
  TEST_MODE: process.env.TEST_MODE ?? 'true',
  HOST: process.env.HOST ?? '0.0.0.0',
  PORT: process.env.PORT ?? '3000',
  API_PREFIX: process.env.API_PREFIX ?? 'api',
  API_VERSIONS: process.env.API_VERSIONS ?? 'v1:1.0.0:active',
  API_DEFAULT_VERSION: process.env.API_DEFAULT_VERSION ?? 'v1',
  API_DEPRECATION_WARNING_DAYS: process.env.API_DEPRECATION_WARNING_DAYS ?? '365',
  API_VERSIONING_ENABLED: process.env.API_VERSIONING_ENABLED ?? 'true',
  API_DEFAULT_LANGUAGE: process.env.API_DEFAULT_LANGUAGE ?? 'en',
  API_AVAILABLE_LANGUAGES: process.env.API_AVAILABLE_LANGUAGES ?? 'en,ar-SA',
  CORS_ENABLED: process.env.CORS_ENABLED ?? 'true',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
  SWAGGER_ENABLED: process.env.SWAGGER_ENABLED ?? 'true',
  SWAGGER_PATH: process.env.SWAGGER_PATH ?? 'api/docs',
  SWAGGER_TITLE: process.env.SWAGGER_TITLE ?? 'API Documentation',
  SWAGGER_DESCRIPTION:
    process.env.SWAGGER_DESCRIPTION ?? 'API documentation for Node Monorepo Boilerplate',
  SWAGGER_VERSION: process.env.SWAGGER_VERSION ?? '1.0.0',
  SWAGGER_TAG: process.env.SWAGGER_TAG ?? 'API',
  DATABASE_URL: isolatedDatabaseUrl,
  EVENTS_DATABASE_URL: isolatedEventsDatabaseUrl,
  REDIS_HOST: String(redisHost),
  REDIS_PORT: String(redisPort),
  REDIS_PASSWORD: String(redisPassword),
  REDIS_DB: String(redisDb),
  REDIS_URL: redisUrl,
  KAFKA_BROKER: String(kafkaBroker),
  KAFKA_BROKERS: String(kafkaBrokers),
  JWT_SECRET: process.env.JWT_SECRET ?? 'test-jwt-secret-at-least-32-characters-long-for-e2e-flow',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '1h',
  AUTH_PROVIDER: process.env.AUTH_PROVIDER ?? 'google-identity-platform',
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER ?? 'mock',
  GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID ?? 'test-project',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? 'test-project',
  FIREBASE_PRIVATE_KEY:
    process.env.FIREBASE_PRIVATE_KEY ??
    JSON.stringify({
      project_id: 'test-project',
      private_key: 'mock-private-key',
      client_email: 'test@test-project.iam.gserviceaccount.com'
    }),
  FIREBASE_CLIENT_EMAIL:
    process.env.FIREBASE_CLIENT_EMAIL ?? 'test@test-project.iam.gserviceaccount.com',
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY ?? 'test-api-key',
  FIREBASE_TENANT_ID: process.env.FIREBASE_TENANT_ID ?? 'test-tenant',
  EVENTS_ENABLED: process.env.EVENTS_ENABLED ?? 'false',
  REDIS_ENABLED: process.env.REDIS_ENABLED ?? 'false',
  THROTTLE_ENABLED: process.env.THROTTLE_ENABLED ?? 'false',
  SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED ?? 'false',
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '',
  ENCRYPTION_KEY:
    process.env.ENCRYPTION_KEY ??
    '1d184ca8e107579837f3d2ff9f8ff7fcb061d3e586bd4a41fbac5dbd0b3e19e6',
  'ENCRYPTION_KEY_primary-encryption-key':
    process.env['ENCRYPTION_KEY_primary-encryption-key'] ??
    '1d184ca8e107579837f3d2ff9f8ff7fcb061d3e586bd4a41fbac5dbd0b3e19e6',
  'ENCRYPTION_KEY_primary-encryption-key-v2':
    process.env['ENCRYPTION_KEY_primary-encryption-key-v2'] ??
    '2e295db9f2186899480f4e30090008adc072e4f67ce5b52bfc6dec1c4f20af72',
  'ENCRYPTION_KEY_primary-encryption-key-v3':
    process.env['ENCRYPTION_KEY_primary-encryption-key-v3'] ??
    '3f3a6eca0d32979005915f4a110019bed083f5a78df6c63c0d7efd2d5a31b083'
};

// eslint-disable-next-line no-console
console.log(
  '[web-e2e] Starting API server for Playwright flow with testcontainers-backed services'
);
// eslint-disable-next-line no-console
console.log(
  '[web-e2e] Runtime:',
  JSON.stringify(
    {
      databaseUrl: env.DATABASE_URL,
      redisHost: env.REDIS_HOST,
      redisPort: env.REDIS_PORT,
      kafkaBrokers: env.KAFKA_BROKERS,
      authProvider: env.AUTH_PROVIDER,
      corsOrigin: env.CORS_ORIGIN
    },
    null,
    2
  )
);

execSync(`${process.execPath} ./node_modules/nx/bin/nx.js run api:build:development`, {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env: {
    ...env,
    NX_DAEMON: 'false',
    NX_ISOLATE_PLUGINS: 'false'
  }
});

// eslint-disable-next-line no-console
console.log('[web-e2e] API build completed, running db-core migrations');
execSync(`${process.execPath} dist/packages/db-core/src/migrations/cli.js`, {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env
});

// eslint-disable-next-line no-console
console.log('[web-e2e] db-core migrations completed, running db-outbox migrations');
execSync(`${process.execPath} dist/packages/db-outbox/src/migrations/cli.js`, {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env
});

// eslint-disable-next-line no-console
console.log('[web-e2e] Database migrations completed, launching dist/apps/api/main.js');

const child = spawn(process.execPath, ['dist/apps/api/main.js'], {
  cwd: workspaceRoot,
  env,
  stdio: 'inherit'
});
const parentPid = process.ppid;

const shutdown = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('SIGTERM'));
process.on('disconnect', () => shutdown('SIGTERM'));

const parentWatchdog = setInterval(() => {
  if (process.ppid === 1 || process.ppid !== parentPid) {
    shutdown('SIGTERM');
    clearInterval(parentWatchdog);
    process.exit(0);
  }
}, 1000);

child.on('exit', (code, signal) => {
  clearInterval(parentWatchdog);
  // eslint-disable-next-line no-console
  console.log('[web-e2e] API child exited', { code, signal });
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 1);
});

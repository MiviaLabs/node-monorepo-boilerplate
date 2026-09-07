import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const workspaceRoot = resolve(process.cwd());
const nextBin = resolve(workspaceRoot, 'node_modules/next/dist/bin/next');

const env = {
  ...process.env,
  API_URL: process.env.API_URL ?? 'http://localhost:3000',
  HOSTNAME: process.env.HOSTNAME ?? '127.0.0.1',
  PORT: process.env.PORT ?? '3001',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? '1',
  WATCHPACK_POLLING: process.env.WATCHPACK_POLLING ?? 'true',
  CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING ?? '1',
  CI: process.env.CI ?? '1',
  NX_DAEMON: 'false',
  NX_ISOLATE_PLUGINS: 'false'
};

// eslint-disable-next-line no-console
console.log('[web-e2e] Launching web dev server for Playwright on http://127.0.0.1:3001');

const child = spawn(
  process.execPath,
  [nextBin, 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3001'],
  {
    cwd: resolve(workspaceRoot, 'apps/web'),
    env,
    stdio: 'inherit'
  }
);

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
  console.log('[web-e2e] Web child exited', { code, signal });

  if (signal) {
    process.exit(0);
  }

  process.exit(code ?? 1);
});

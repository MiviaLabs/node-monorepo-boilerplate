import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const workspaceRoot = resolve(process.cwd());
const nextBin = resolve(workspaceRoot, 'node_modules/next/dist/bin/next');

const env = {
  ...process.env,
  API_URL: process.env.API_URL ?? 'http://localhost:3000'
};

const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', '3002'], {
  cwd: resolve(workspaceRoot, 'apps/admin'),
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
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 1);
});

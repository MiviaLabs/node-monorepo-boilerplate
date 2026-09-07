import { execSync, spawn } from 'node:child_process';

const workspaceRoot = process.cwd();
const apiHealthUrl = 'http://127.0.0.1:3000/api/v1/ops/health';
const adminUrl = 'http://127.0.0.1:3002';
const sharedEnv = {
  ...process.env,
  NODE_ENV: 'test',
  NX_DAEMON: 'false',
  JWT_SECRET:
    process.env.JWT_SECRET ?? 'test-jwt-secret-at-least-32-characters-long-for-e2e-flow',
  ENCRYPTION_KEY:
    process.env.ENCRYPTION_KEY ??
    '1d184ca8e107579837f3d2ff9f8ff7fcb061d3e586bd4a41fbac5dbd0b3e19e6'
};

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let tearingDown = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the timeout expires.
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function spawnChild(command, args, env) {
  const child = spawn(command, args, {
    cwd: workspaceRoot,
    env,
    stdio: 'inherit'
  });

  children.push(child);
  child.on('exit', (code, signal) => {
    if (!tearingDown && code !== 0 && signal == null) {
      // eslint-disable-next-line no-console
      console.error(`[admin-e2e] Child process exited early: ${command} ${args.join(' ')}`);
    }
  });

  return child;
}

function pruneLingeringProcesses() {
  const commands = [
    'pkill -f "next dev --port 3002" || true',
    'pkill -f "nx run admin:dev" || true',
    'pkill -f "node apps/admin-e2e/scripts/start-api-e2e.mjs" || true',
    'pkill -f "nx run api:serve" || true'
  ];

  for (const command of commands) {
    try {
      execSync(command, {
        cwd: workspaceRoot,
        stdio: 'ignore',
        shell: '/bin/bash'
      });
    } catch {
      // Ignore cleanup failures before and after the run.
    }
  }
}

function stopChildren() {
  for (const child of children.reverse()) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

async function teardown() {
  if (tearingDown) return;
  tearingDown = true;

  stopChildren();
  pruneLingeringProcesses();

  try {
    execSync('pnpm --dir apps/api test:e2e:teardown', {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
  } catch {
    // Ignore teardown failures on cleanup.
  }
}

process.on('SIGINT', async () => {
  await teardown();
  process.exit(130);
});

process.on('SIGTERM', async () => {
  await teardown();
  process.exit(143);
});

async function main() {
  pruneLingeringProcesses();

  try {
    execSync('pnpm --dir apps/api test:e2e:teardown', {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: sharedEnv
    });
  } catch {
    // Ignore teardown failures when no prior stack exists.
  }

  execSync('pnpm --dir apps/api test:e2e:setup', {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: sharedEnv
  });

  spawnChild(process.execPath, ['apps/admin-e2e/scripts/start-api-e2e.mjs'], sharedEnv);
  await waitForUrl(apiHealthUrl, 180000, 'API health');

  spawnChild('pnpm', ['exec', 'nx', 'run', 'admin:dev'], {
    ...sharedEnv,
    API_URL: 'http://127.0.0.1:3000'
  });
  await waitForUrl(adminUrl, 120000, 'admin app');

  execSync(
    'pnpm exec playwright test --config apps/admin-e2e/playwright.config.ts --project=chromium --workers=1 --reporter=line',
    {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: {
        ...sharedEnv,
        BASE_URL: adminUrl,
        PLAYWRIGHT_SKIP_LOCAL_STACK: 'true'
      }
    }
  );
}

try {
  await main();
} finally {
  await teardown();
}

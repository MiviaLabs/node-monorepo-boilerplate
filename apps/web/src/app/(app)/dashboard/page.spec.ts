import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readSource(relativePath: string) {
  const fs = await import('node:fs/promises');
  return fs.readFile(path.join(__dirname, relativePath), 'utf-8');
}

describe('workspace dashboard routing', () => {
  it('streams workspace stats behind suspense so the dashboard shell does not wait on counts', async () => {
    const source = await readSource('page.tsx');

    expect(source).toContain("import { Suspense } from 'react';");
    expect(source).toContain('function DashboardStatsFallback');
    expect(source).toContain('async function DashboardStatsSection');
    expect(source).toContain('web.page.dashboard.stats');
    expect(source).toContain('<Suspense');
    expect(source).toContain('DashboardStatsFallback');
    expect(source).toContain('DashboardStatsSection');
    expect(source).toContain('Promise.allSettled');
    expect(source).not.toContain('DEFER_DASHBOARD_COUNTS');
  });
});

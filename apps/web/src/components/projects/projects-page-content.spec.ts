import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readProjectsPageContentSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'projects-page-content.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('projects-page-content architecture', () => {
  it('keeps the projects list server-owned instead of remounting the list query in the client', async () => {
    const source = await readProjectsPageContentSource();

    expect(source).toContain('router.refresh()');
    expect(source).not.toContain('useSearchParams');
    expect(source).not.toContain('api.projects.list.useQuery');
    expect(source).not.toContain('projectsQuery.refetch');
  });

  it('routes filter changes through router transitions and still invalidates shared project caches', async () => {
    const source = await readProjectsPageContentSource();

    expect(source).toContain('startTransition(() => {');
    expect(source).toContain('router.replace(href, { scroll: false })');
    expect(source).toContain('await utils.projects.list.invalidate();');
  });
});

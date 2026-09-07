import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readProjectsTableSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'projects-table.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('projects table layout', () => {
  it('uses the shared inventory list shell instead of the generic table primitive', async () => {
    const source = await readProjectsTableSource();

    expect(source).toContain('InventoryListShell');
    expect(source).toContain('InventoryListPagination');
    expect(source).toContain('ProjectActionsMenu');
    expect(source).not.toContain("from '~/components/ui/table'");
    expect(source).not.toContain('<Table');
  });

  it('keeps the issues-style list row layout with responsive grid rows', async () => {
    const source = await readProjectsTableSource();

    expect(source).toContain('summary={summary}');
    expect(source).toContain('headerActions=');
    expect(source).toContain(
      'md:grid md:grid-cols-[minmax(0,1.8fr)_110px_120px_110px_110px_120px]'
    );
    expect(source).toContain('PROJECT_VISIBILITY_LABELS[project.visibility]');
    expect(source).toContain('{project.key}');
  });
});

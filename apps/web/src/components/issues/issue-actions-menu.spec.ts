import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readSource() {
  const fs = await import('node:fs/promises');
  return fs.readFile(path.join(__dirname, 'issue-actions-menu.tsx'), 'utf-8');
}

describe('issue actions menu', () => {
  it('uses the shared dropdown and destructive confirmation dialog for issue actions', async () => {
    const source = await readSource();

    expect(source).toContain('DropdownMenu');
    expect(source).toContain('AlertDialog');
    expect(source).toContain('DropdownMenuLabel>Issue actions<');
    expect(source).toContain('Open issue');
    expect(source).toContain('Copy link');
    expect(source).toContain('Delete issue');
    expect(source).toContain('This removes the issue from the workspace and cannot be undone.');
    expect(source).toContain(
      'Deleting this issue also deletes all comments, attached files, and subtasks.'
    );
    expect(source).toContain('Attached files will be scheduled for permanent storage purge.');
    expect(source).toContain('Open issue actions');
    expect(source).toContain(
      'const hasActions = canOpenIssue || (resolvedCanDelete && Boolean(resolvedOnDelete));'
    );
    expect(source).toContain('if (!hasActions) {');
    expect(source).toContain('return null;');
  });
});

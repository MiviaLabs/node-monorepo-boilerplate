import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readMembersTableSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'members-table.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('members table layout', () => {
  it('uses the shared inventory list shell instead of the previous react-table shell', async () => {
    const source = await readMembersTableSource();

    expect(source).toContain('InventoryListShell');
    expect(source).toContain('InventoryListPagination');
    expect(source).not.toContain('useReactTable');
    expect(source).not.toContain('getMembersTableColumns');
  });

  it('keeps the issues-style responsive row layout and member actions', async () => {
    const source = await readMembersTableSource();

    expect(source).toContain('summary={summary}');
    expect(source).toContain('headerActions=');
    expect(source).toContain('MemberActionsCell');
    expect(source).toContain("? 'grid-cols-[minmax(0,1.8fr)_110px_110px_110px_56px]'");
    expect(source).toContain(": 'grid-cols-[minmax(0,1.8fr)_110px_110px_110px]';");
  });
});

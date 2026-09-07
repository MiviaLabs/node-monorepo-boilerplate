import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readMembersActionsSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'members-table-actions.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('members-table-actions architecture', () => {
  it('uses optimistic callbacks instead of React Query cache mutation helpers', async () => {
    const source = await readMembersActionsSource();

    expect(source).toContain('optimisticActions?.onRoleOptimisticUpdate');
    expect(source).toContain('optimisticActions?.onStatusOptimisticUpdate');
    expect(source).toContain('optimisticActions?.onDeleteOptimistic');
    expect(source).not.toContain('useQueryClient');
    expect(source).not.toContain('invalidateAndRefresh');
  });

  it('invalidates shared members queries and still refreshes the route after success', async () => {
    const source = await readMembersActionsSource();

    expect(source).toContain('const utils = api.useUtils();');
    expect(source).toContain('await utils.members.getMembers.invalidate();');
    expect(source).toContain("await handleMutationSuccess('updated member role', onSuccess)");
    expect(source).toContain("await handleMutationSuccess('updated member status', onSuccess)");
    expect(source).toContain("await handleMutationSuccess('revoked invitation', onSuccess)");
    expect(source).toContain("await handleMutationSuccess('removed member', onSuccess)");
    expect(source).not.toContain('invalidateQueries');
  });
});

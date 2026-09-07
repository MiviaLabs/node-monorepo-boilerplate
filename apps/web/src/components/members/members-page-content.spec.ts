import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readMembersPageContentSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'members-page-content.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('members-page-content architecture', () => {
  it('keeps the members list server-owned instead of mounting a client data query', async () => {
    const source = await readMembersPageContentSource();

    expect(source).toContain('useOptimistic');
    expect(source).toContain('router.refresh()');
    expect(source).not.toContain('useSearchParams');
    expect(source).not.toContain('api.members.getMembers.useQuery');
    expect(source).not.toContain("refetchOnMount: 'always'");
  });

  it('navigates query changes through the router transition instead of a client query refetch', async () => {
    const source = await readMembersPageContentSource();

    expect(source).toContain('startTransition(() => {');
    expect(source).toContain('router.replace(href, { scroll: false })');
    expect(source).toContain('toMembersQuerySearchParams(queryInput');
  });
});

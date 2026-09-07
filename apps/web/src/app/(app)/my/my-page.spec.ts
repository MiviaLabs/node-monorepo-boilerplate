import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readSource(relativePath: string) {
  const fs = await import('node:fs/promises');
  return fs.readFile(path.join(__dirname, relativePath), 'utf-8');
}

describe('my work page data wiring', () => {
  it('builds the recent issue lane from user activity instead of generic visible issues', async () => {
    const source = await readSource('page.tsx');

    expect(source).toContain('getMyWorkPageData()');
    expect(source).toContain('assignedIssueCount');
    expect(source).toContain('accessibleProjectCount');
    expect(source).toContain('collaborationProjectCount');
    expect(source).toContain('assignedIssues={assignedIssueEntries}');
    expect(source).toContain('recentIssues={recentIssueEntries}');
    expect(source).toContain('watchingIssues={watchingIssueEntries}');
  });
});

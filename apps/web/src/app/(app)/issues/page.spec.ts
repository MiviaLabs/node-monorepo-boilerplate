import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readSource() {
  const fs = await import('node:fs/promises');
  return fs.readFile(path.join(__dirname, 'page.tsx'), 'utf-8');
}

describe('workspace issues page', () => {
  it('passes issue permissions into the workspace issues client component', async () => {
    const source = await readSource();

    expect(source).toContain('const { canCreateIssues, canDeleteIssues, canUpdateIssues }');
    expect(source).toContain('canDeleteIssues={canDeleteIssues}');
    expect(source).toContain('canUpdateIssues={canUpdateIssues}');
    expect(source).toContain('currentUserId={Number(user.userId)}');
  });

  it('hydrates workspace issue records with project member options for inline assignee editing', async () => {
    const source = await readSource();

    expect(source).toContain('getWorkspaceIssuesPageData()');
    expect(source).toContain('resolveIssueAssigneeCandidates');
    expect(source).toContain('organizationMembers');
    expect(source).toContain('privateProjectMembersByProjectId');
    expect(source).toContain('projectMembersLookup = new Map<string, ProjectMember[]>');
    expect(source).toContain('issue.project?.visibility');
  });
});

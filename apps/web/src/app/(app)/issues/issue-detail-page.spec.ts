import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readSource(relativePath: string) {
  const fs = await import('node:fs/promises');
  return fs.readFile(path.join(__dirname, relativePath), 'utf-8');
}

describe('workspace issue detail routing', () => {
  it('renders a standalone workspace issue detail page using the original detail component', async () => {
    const source = await readSource('[issueId]/page.tsx');

    expect(source).toContain('ProjectIssueDetailPageContent');
    expect(source).toContain('getIssuePageData(issueId)');
    expect(source).toContain('buildProjectIssuesDetailHrefs');
    expect(source).toContain('parseProjectIssuesQueryParams');
    expect(source).toContain('const queryState = parseProjectIssuesQueryParams');
    expect(source).toContain('const { listHref, issueHref } = buildProjectIssuesDetailHrefs');
    expect(source).toContain('initialComments={issue.comments}');
    expect(source).toContain('initialAttachments={attachments}');
    expect(source).toContain('initialActivity={issue.activity}');
    expect(source).toContain('initialRelations={issue.relations}');
    expect(source).toContain('initialSubtasks={issue.subtasks}');
    expect(source).toContain('initialWatchers={issue.watchers}');
    expect(source).toContain('relationCandidates={relationCandidates}');
    expect(source).toContain('error instanceof IssueFetchError && error.statusCode === 404');
    expect(source).not.toContain('listRelationCandidateIssues(issue.projectId, String(issue.id))');
    expect(source).not.toContain('listAllIssues');
    expect(source).toContain('canCreateIssue={canCreateIssues}');
    expect(source).toContain('canDeleteIssue={canDeleteIssues}');
    expect(source).toContain('canCreateComment={canUpdateIssues}');
    expect(source).toContain('currentUserId={Number(user.userId)}');
    expect(source).not.toContain('currentUserLabel=');
  });

  it('redirects legacy project issue detail routes into the canonical workspace detail route', async () => {
    const source = await readSource('../projects/[projectId]/issues/[issueId]/page.tsx');

    expect(source).toContain(
      '`/issues/${encodeURIComponent(issueId)}?projectId=${encodeURIComponent(projectId)}`'
    );
  });
});

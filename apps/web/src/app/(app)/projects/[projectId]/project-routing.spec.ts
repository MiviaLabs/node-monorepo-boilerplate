import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readSource(relativePath: string) {
  const fs = await import('node:fs/promises');
  return fs.readFile(path.join(__dirname, relativePath), 'utf-8');
}

describe('project route wiring', () => {
  it('mounts the project overview page at the canonical project route', async () => {
    const source = await readSource('page.tsx');

    expect(source).toContain('ProjectOverviewPageContent');
    expect(source).toContain(
      'const issueSummary = await getIssuesSummary({ projectId: Number(projectId) });'
    );
    expect(source).toContain('initialIssueSummary={issueSummary}');
    expect(source).not.toContain('ProjectSettingsPageContent');
  });

  it('mounts project settings at the explicit settings route', async () => {
    const source = await readSource('settings/page.tsx');

    expect(source).toContain('ProjectSettingsPageContent');
    expect(source).toContain('getAuthorizedProjectPageData(projectId)');
    expect(source).not.toContain('redirect(`/projects/${projectId}`)');
  });

  it('uses the base project helper on routes that do not need member data', async () => {
    const contentSource = await readSource('content/page.tsx');
    const contentDetailSource = await readSource('content/[contentSlug]/page.tsx');
    const issueRedirectSource = await readSource('issues/page.tsx');
    const issueDetailRedirectSource = await readSource('issues/[issueId]/page.tsx');

    expect(contentSource).toContain('getAuthorizedProjectData(projectId)');
    expect(contentSource).not.toContain('getAuthorizedProjectPageData(projectId)');
    expect(contentDetailSource).toContain('getAuthorizedProjectData(projectId)');
    expect(contentDetailSource).not.toContain('getAuthorizedProjectPageData(projectId)');
    expect(issueRedirectSource).toContain('getAuthorizedProjectData(projectId)');
    expect(issueRedirectSource).not.toContain('getAuthorizedProjectPageData(projectId)');
    expect(issueDetailRedirectSource).toContain('getAuthorizedProjectData(projectId)');
    expect(issueDetailRedirectSource).not.toContain('getAuthorizedProjectPageData(projectId)');
  });
});

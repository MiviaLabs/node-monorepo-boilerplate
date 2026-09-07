import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readSource(fileName: string) {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, fileName);
  return fs.readFile(filePath, 'utf-8');
}

describe('project detail page architecture', () => {
  it('keeps project overview server-fed instead of mounting detail queries on hydration', async () => {
    const source = await readSource('project-overview-page-content.tsx');

    expect(source).not.toContain('api.projects.get.useQuery');
    expect(source).not.toContain('api.projects.listMembers.useQuery');
    expect(source).not.toContain('getProjectIssuesPreview');
    expect(source).toContain('const project = initialProject;');
    expect(source).toContain('const projectMembers = initialMembers;');
    expect(source).toContain('const issueSummary = initialIssueSummary ?? {');
    expect(source).toContain('href: `/issues?projectId=${project.id}`');
    expect(source).toContain('Project key');
    expect(source).toContain('{project.key}');
  });

  it('uses local state plus route refresh for project settings instead of query refetch ownership', async () => {
    const source = await readSource('project-settings-page-content.tsx');

    expect(source).not.toContain('api.projects.get.useQuery');
    expect(source).not.toContain('api.projects.listMembers.useQuery');
    expect(source).not.toContain('projectQuery.refetch');
    expect(source).toContain('const [project, setProject] = useState(initialProject);');
    expect(source).toContain(
      'const [projectMembers, setProjectMembers] = useState(initialMembers);'
    );
    expect(source).toContain('router.refresh()');
    expect(source).toContain('<FormLabel>Project key</FormLabel>');
    expect(source).toContain('value={project.key}');
  });
});

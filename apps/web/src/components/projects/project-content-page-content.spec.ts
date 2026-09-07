import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readProjectContentPageContentSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'project-content-page-content.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('project content page architecture', () => {
  it('renders server-fed project content pages through the shared content workspace', async () => {
    const source = await readProjectContentPageContentSource();

    expect(source).toContain(
      "import { ContentWorkspace } from '~/components/content/content-workspace';"
    );
    expect(source).toContain(
      "import { getContentAncestorPath } from '~/lib/content/content-tree';"
    );
    expect(source).toContain(
      "import { ContentComments } from '~/components/content/content-comments';"
    );
    expect(source).toContain('pages={pages}');
    expect(source).toContain('breadcrumbs={breadcrumbs}');
    expect(source).toContain('canEdit={canEdit}');
    expect(source).toContain('canDelete={canDelete}');
    expect(source).toContain('selectedPageSlug={selectedPageSlug}');
    expect(source).toContain('initialComments={initialComments}');
    expect(source).toContain('canCreateComment={canEdit}');
    expect(source).toContain('const updated = await contentApi.updateContentEntry(');
    expect(source).toContain('baseRevision,');
    expect(source).toContain('Number(pageId),');
    expect(source).toContain('undefined,');
    expect(source).toContain('options');
    expect(source).toContain('await contentApi.deleteContentEntry(Number(page.id));');
    expect(source).toContain('router.replace(deleteFallbackHref);');
    expect(source).toContain('slug');
    expect(source).toContain('router.replace(`/projects/${project.id}/content/${updated.slug}`);');
  });
});

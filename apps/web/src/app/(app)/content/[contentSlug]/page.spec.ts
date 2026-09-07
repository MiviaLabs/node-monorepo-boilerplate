import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readPageSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'page.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('organization content document page', () => {
  it('loads the selected entry separately and leaves comments off the server critical path', async () => {
    const source = await readPageSource();

    expect(source).toContain(
      "import { ContentFetchError, getOrganizationContentPageBySlug } from '~/lib/content/get-content';"
    );
    expect(source).toContain('pages = await getOrganizationContentPageBySlug(contentSlug);');
    expect(source).toContain('if (error instanceof ContentFetchError && error.status === 404) {');
    expect(source).not.toContain('getContentComments');
    expect(source).not.toContain('initialComments={initialComments}');
  });
});

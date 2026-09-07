import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readContentTableOfContentsSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'content-table-of-contents-node.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('content table-of-contents architecture', () => {
  it('renders a live heading outline block that scrolls to stable heading anchors', async () => {
    const source = await readContentTableOfContentsSource();

    expect(source).toContain("name: 'tableOfContents'");
    expect(source).toContain('data-content-table-of-contents="true"');
    expect(source).toContain("node.type.name !== 'heading'");
    expect(source).toContain('document.getElementById(item.anchorId)');
    expect(source).toContain("window.history.replaceState(null, '', `#${item.anchorId}`);");
    expect(source).toContain('ReactNodeViewRenderer(ContentTableOfContentsNodeView)');
  });
});

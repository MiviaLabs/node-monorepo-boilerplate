import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readContentCodeBlockNodeSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'content-code-block-node.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('content code block node architecture', () => {
  it('renders mermaid code blocks with code, preview, split, and expand affordances', async () => {
    const source = await readContentCodeBlockNodeSource();

    expect(source).toContain("import CodeBlock from '@tiptap/extension-code-block';");
    expect(source).toContain('const enum MermaidViewMode {');
    expect(source).toContain('useState<MermaidViewMode>(MermaidViewMode.Preview)');
    expect(source).toContain('const isMermaid = isMermaidLanguage(language);');
    expect(source).toContain('title="Show code"');
    expect(source).toContain('title="Show preview"');
    expect(source).toContain('title="Show split view"');
    expect(source).toContain('title="Expand diagram preview"');
    expect(source).toContain('title="Zoom out"');
    expect(source).toContain('title="Zoom in"');
    expect(source).toContain('cursor-grabbing');
    expect(source).toContain('scale={expandedScale}');
    expect(source).toContain('mode={MermaidPreviewMode.Overlay}');
    expect(source).toContain('pointer-events-none absolute inset-x-3 top-3 z-10');
    expect(source).toContain('group-hover/code-block:opacity-100');
    expect(source).toContain('const CODE_BLOCK_LANGUAGES = [');
    expect(source).toContain('<DropdownMenu>');
    expect(source).toContain(
      "title={canEdit ? 'Select code block language' : 'Code block language'}"
    );
    expect(source).toContain('onSelect={() => updateAttributes({ language: option.value })}');
    expect(source).toContain(
      '<ContentMermaidPreview code={code} className="min-h-[260px] pt-10" />'
    );
    expect(source).toContain('<Dialog open={isExpanded} onOpenChange={setIsExpanded}>');
    expect(source).toContain('ReactNodeViewRenderer(ContentCodeBlockNodeView)');
  });
});

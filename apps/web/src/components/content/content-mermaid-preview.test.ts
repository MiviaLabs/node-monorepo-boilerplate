import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMermaidLanguage } from './content-mermaid-preview';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readContentMermaidPreviewSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'content-mermaid-preview.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('content mermaid preview helpers', () => {
  it('recognizes mermaid language identifiers case-insensitively', () => {
    expect(isMermaidLanguage('mermaid')).toBe(true);
    expect(isMermaidLanguage(' Mermaid ')).toBe(true);
    expect(isMermaidLanguage('typescript')).toBe(false);
    expect(isMermaidLanguage(undefined)).toBe(false);
  });

  it('keeps overlay previews on intrinsic svg dimensions for real zoom and pan', async () => {
    const source = await readContentMermaidPreviewSource();

    expect(source).toContain('flowchart: {');
    expect(source).toContain('useMaxWidth: false');
    expect(source).toContain('const enum MermaidPreviewMode {');
    expect(source).toContain('mode = MermaidPreviewMode.Inline');
    expect(source).toContain('mode === MermaidPreviewMode.Overlay');
    expect(source).toContain("new DOMParser().parseFromString(svg, 'image/svg+xml')");
    expect(source).toContain('overlayWidth ? `${overlayWidth * scale}px`');
    expect(source).toContain('overlayHeight ? `${overlayHeight * scale}px`');
  });
});

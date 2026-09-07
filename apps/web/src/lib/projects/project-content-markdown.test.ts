import { describe, expect, it } from 'vitest';

import {
  extractContentTitleAndBody,
  parseMarkdownToContentDoc,
  serializeContentDocToMarkdown
} from './project-content-markdown';

describe('project content markdown', () => {
  it('parses markdown headings and task lists into content nodes', () => {
    const doc = parseMarkdownToContentDoc(`# Launch Plan

- [x] Scope locked
- [ ] Rollout approved
`);

    expect(doc.content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 1, anchorId: 'launch-plan' }
    });
    expect(doc.content?.[1]).toMatchObject({
      type: 'taskList'
    });
  });

  it('extracts the first h1 as the editable page title', () => {
    const result = extractContentTitleAndBody(
      `# Workspace Brief

Body copy here.
`,
      'Fallback'
    );

    expect(result.title).toBe('Workspace Brief');
    expect(result.body.content?.[0]).toMatchObject({ type: 'paragraph' });
  });

  it('serializes task lists back to markdown checkboxes', () => {
    expect(
      serializeContentDocToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Done' }]
                  }
                ]
              }
            ]
          }
        ]
      })
    ).toContain('- \\[x\\] Done');
  });

  it('drops unsupported marks like smallText when serializing stored editor docs', () => {
    expect(
      serializeContentDocToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Tiny copy',
                marks: [{ type: 'smallText' }]
              }
            ]
          }
        ]
      })
    ).toContain('Tiny copy');
  });

  it('round-trips heading anchors and table-of-contents markers', () => {
    const doc = parseMarkdownToContentDoc(`[[toc]]

## Launch Plan {#launch-plan}

Body copy
`);

    expect(doc.content?.[0]).toMatchObject({ type: 'tableOfContents' });
    expect(doc.content?.[1]).toMatchObject({
      type: 'heading',
      attrs: { level: 2, anchorId: 'launch-plan' }
    });

    expect(serializeContentDocToMarkdown(doc)).toContain('[[toc]]');
    expect(serializeContentDocToMarkdown(doc)).toContain('## Launch Plan {#launch-plan}');
  });
});

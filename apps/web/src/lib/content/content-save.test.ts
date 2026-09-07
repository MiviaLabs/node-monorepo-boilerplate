import { describe, expect, it } from 'vitest';

import { buildContentSaveInput, normalizeContentSlug } from './content-save';

describe('content save helpers', () => {
  it('normalizes titles into API-compatible content slugs', () => {
    expect(normalizeContentSlug('Hello world')).toBe('hello-world');
    expect(normalizeContentSlug('  Multi   Space  ')).toBe('multi-space');
    expect(normalizeContentSlug('...')).toBe('untitled');
  });

  it('builds save payloads with normalized title, slug, and markdown', () => {
    const payload = buildContentSaveInput({
      baseRevision: '2026-03-22T00:00:00.000Z',
      pageId: '12',
      currentSlug: 'old-slug',
      title: '  Launch Plan  ',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body copy' }]
          }
        ]
      }
    });

    expect(payload.pageId).toBe('12');
    expect(payload.baseRevision).toBe('2026-03-22T00:00:00.000Z');
    expect(payload.currentSlug).toBe('old-slug');
    expect(payload.title).toBe('Launch Plan');
    expect(payload.slug).toBe('old-slug');
    expect(payload.contentMarkdown).toContain('# Launch Plan');
    expect(payload.contentMarkdown).toContain('Body copy');
  });

  it('keeps the existing draft slug when saving an untitled page', () => {
    const payload = buildContentSaveInput({
      baseRevision: '2026-03-22T00:00:00.000Z',
      pageId: '12',
      currentSlug: 'untitled-2',
      title: '   ',
      body: {
        type: 'doc',
        content: []
      }
    });

    expect(payload.title).toBe('Untitled');
    expect(payload.slug).toBe('untitled-2');
    expect(payload.contentMarkdown).toContain('# Untitled');
  });

  it('does not crash when legacy unsupported marks exist in the editor document', () => {
    const payload = buildContentSaveInput({
      baseRevision: '2026-03-22T00:00:00.000Z',
      pageId: '12',
      currentSlug: 'launch-plan',
      title: 'Launch Plan',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Legacy small text',
                marks: [{ type: 'smallText' }]
              }
            ]
          }
        ]
      }
    });

    expect(payload.contentMarkdown).toContain('Legacy small text');
  });

  it('allows an explicit slug override when a dedicated slug edit is provided', () => {
    const payload = buildContentSaveInput({
      baseRevision: '2026-03-22T00:00:00.000Z',
      pageId: '12',
      currentSlug: 'launch-plan',
      slugValue: 'Launch Plan v2',
      title: 'Launch Plan',
      body: {
        type: 'doc',
        content: []
      }
    });

    expect(payload.slug).toBe('launch-plan-v2');
  });
});

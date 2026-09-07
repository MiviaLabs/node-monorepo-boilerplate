import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearStoredContentDraft,
  readStoredContentDraft,
  shouldRestoreStoredContentDraft,
  writeStoredContentDraft
} from './content-draft-storage';

describe('content draft storage', () => {
  const pageId = 'page-123';
  const storage = new Map<string, string>();
  const draft = {
    pageId,
    title: 'Draft title',
    body: { type: 'doc', content: [{ type: 'paragraph' }] },
    baseRevision: '2026-03-22T10:00:00.000Z',
    currentSlug: 'draft-title',
    slugValue: 'draft-title',
    hasExplicitSlugOverride: true,
    snapshot: '{"pageId":"page-123"}',
    savedAt: '2026-03-22T10:01:00.000Z'
  };

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        }
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips stored drafts', () => {
    writeStoredContentDraft(draft);

    expect(readStoredContentDraft(pageId)).toEqual({
      ...draft,
      version: 1
    });
  });

  it('clears invalid draft payloads', () => {
    storage.set(`content-draft:${pageId}`, '{"pageId":"page-123","version":1}');

    expect(readStoredContentDraft(pageId)).toBeNull();
    expect(storage.get(`content-draft:${pageId}`)).toBeUndefined();
  });

  it('clears stored drafts', () => {
    writeStoredContentDraft(draft);
    clearStoredContentDraft(pageId);

    expect(readStoredContentDraft(pageId)).toBeNull();
  });

  it('offers restore only when the local snapshot differs from the server snapshot', () => {
    expect(
      shouldRestoreStoredContentDraft({
        storedDraft: null,
        currentSnapshot: '{"pageId":"page-123"}'
      })
    ).toBe(false);

    expect(
      shouldRestoreStoredContentDraft({
        storedDraft: { ...draft, version: 1 },
        currentSnapshot: '{"pageId":"page-123"}'
      })
    ).toBe(false);

    expect(
      shouldRestoreStoredContentDraft({
        storedDraft: { ...draft, version: 1 },
        currentSnapshot: '{"pageId":"page-123","changed":true}'
      })
    ).toBe(true);
  });
});

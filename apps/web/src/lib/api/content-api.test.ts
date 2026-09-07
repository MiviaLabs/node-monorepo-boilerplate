import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/content/content-events', () => ({
  emitContentRefresh: vi.fn()
}));

import { ContentApiError, contentApi } from './content-api';

import { emitContentRefresh } from '~/lib/content/content-events';
import { ContentScope } from '~/types/content.types';

describe('contentApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('posts draft content creation payloads and emits a refresh event', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 12,
          slug: 'untitled-created',
          title: 'Untitled'
        }
      })
    });

    await contentApi.createDraftContentEntry(
      {
        title: 'Untitled',
        contentMarkdown: '# Untitled',
        projectId: 42,
        parentId: 7
      },
      'tenant-123'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/content',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-123'
        }),
        body: expect.any(String)
      })
    );

    const request = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      body: string;
    };
    const payload = JSON.parse(request.body) as {
      title: string;
      contentMarkdown: string;
      projectId: number;
      parentId: number;
      slug: string;
    };

    expect(payload.title).toBe('Untitled');
    expect(payload.contentMarkdown).toBe('# Untitled');
    expect(payload.projectId).toBe(42);
    expect(payload.parentId).toBe(7);
    expect(payload.slug).toMatch(/^untitled-/);
    expect(emitContentRefresh).toHaveBeenCalledTimes(1);
  });

  it('deletes content entries and emits a refresh event', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null
    });

    await contentApi.deleteContentEntry(12, 'tenant-123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/content/12',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123'
        })
      })
    );
    expect(emitContentRefresh).toHaveBeenCalledTimes(1);
  });

  it('lists content comments without emitting a refresh event', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 19,
          contentEntryId: 12,
          authorUserId: 9,
          authorDisplayName: 'Jordan Lee',
          authorPhotoUrl: 'https://signed.example.test/avatar.png',
          bodyMarkdown: 'First',
          createdAt: '2026-03-28T10:00:00.000Z',
          updatedAt: '2026-03-28T10:00:00.000Z',
          canDelete: true
        }
      ]
    });

    const comments = await contentApi.listContentComments(12, 'tenant-123');

    expect(comments).toHaveLength(1);
    expect(comments[0]?.bodyMarkdown).toBe('First');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/content/12/comments',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123'
        })
      })
    );
    expect(emitContentRefresh).not.toHaveBeenCalled();
  });

  it('creates content comments and returns the created comment', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 20,
          contentEntryId: 12,
          authorUserId: 9,
          authorDisplayName: 'Jordan Lee',
          authorPhotoUrl: null,
          bodyMarkdown: 'Looks good.',
          createdAt: '2026-03-28T10:00:00.000Z',
          updatedAt: '2026-03-28T10:00:00.000Z',
          canDelete: true
        }
      })
    });

    const comment = await contentApi.createContentComment(
      12,
      { bodyMarkdown: 'Looks good.' },
      'tenant-123'
    );

    expect(comment.id).toBe(20);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/content/12/comments',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-123'
        }),
        body: JSON.stringify({ bodyMarkdown: 'Looks good.' })
      })
    );
    expect(emitContentRefresh).not.toHaveBeenCalled();
  });

  it('deletes content comments without emitting a refresh event', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null
    });

    await contentApi.deleteContentComment(12, 20, 'tenant-123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/content/12/comments/20',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123'
        })
      })
    );
    expect(emitContentRefresh).not.toHaveBeenCalled();
  });

  it('gets a single content entry without emitting a refresh event', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 12,
          slug: 'launch-plan',
          title: 'Launch Plan',
          contentMarkdown: '# Launch Plan'
        }
      })
    });

    const entry = await contentApi.getContentEntry(12, 'tenant-123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/content/12',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123'
        })
      })
    );
    expect(entry.slug).toBe('launch-plan');
    expect(emitContentRefresh).not.toHaveBeenCalled();
  });

  it('includes explicit content scope filters when listing entries', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 12, slug: 'ops', title: 'Ops', contentMarkdown: '# Ops' }]
      })
    });

    await contentApi.listContentEntries({ scope: ContentScope.ORGANIZATION }, 'tenant-123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/content?scope=organization',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123'
        })
      })
    );
  });

  it('moves content entries through the shared update path and emits a refresh event', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 12,
          parentId: 7,
          position: 2,
          slug: 'moved-page',
          title: 'Moved Page'
        }
      })
    });

    await contentApi.moveContentEntry(12, { parentId: 7, position: 2 }, 'tenant-123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/content/12',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-123'
        }),
        body: JSON.stringify({ parentId: 7, position: 2 })
      })
    );
    expect(emitContentRefresh).toHaveBeenCalledTimes(1);
  });

  it('passes keepalive transport options through content updates', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 12,
          slug: 'kept-alive',
          title: 'Kept Alive'
        }
      })
    });

    await contentApi.updateContentEntry(
      12,
      { title: 'Kept Alive', contentMarkdown: '# Kept Alive' },
      'tenant-123',
      { keepalive: true }
    );

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/content/12',
      expect.objectContaining({
        method: 'PATCH',
        keepalive: true,
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-123'
        })
      })
    );
    expect(emitContentRefresh).toHaveBeenCalledTimes(1);
  });

  it('forwards base revisions on content updates', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 12,
          slug: 'kept-alive',
          title: 'Kept Alive',
          revision: '2026-03-22T02:00:00.000Z'
        }
      })
    });

    await contentApi.updateContentEntry(12, {
      baseRevision: '2026-03-22T01:00:00.000Z',
      title: 'Kept Alive',
      contentMarkdown: '# Kept Alive'
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/content/12',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          baseRevision: '2026-03-22T01:00:00.000Z',
          title: 'Kept Alive',
          contentMarkdown: '# Kept Alive'
        })
      })
    );
  });

  it('throws a typed conflict error for stale updates', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        message: 'Concurrent modification conflict for content 12.'
      })
    });

    await expect(
      contentApi.updateContentEntry(12, {
        baseRevision: '2026-03-22T01:00:00.000Z',
        title: 'Kept Alive',
        contentMarkdown: '# Kept Alive'
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<ContentApiError>>({
        name: 'ContentApiError',
        status: 409
      })
    );
  });
});

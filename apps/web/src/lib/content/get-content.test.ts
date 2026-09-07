import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      if (name === 'accessToken') {
        return { value: 'cookie-token' };
      }

      if (name === 'tenantId') {
        return { value: '456' };
      }

      return undefined;
    }
  }))
}));

vi.mock('~/lib/runtime-config', () => ({
  getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3001/api/v1')
}));

vi.mock('~/lib/auth/server-request-auth', () => ({
  resolveServerRequestAuthContext: vi.fn(async () => ({
    accessToken: 'cookie-token',
    tenantId: '456'
  }))
}));

vi.mock('~/lib/content/content-entry-adapter', () => ({
  buildOrganizationContentPages: vi.fn(
    (entries: Array<{ id: number; slug: string; title: string }>) =>
      entries.map((entry) => ({ ...entry }))
  ),
  buildProjectContentPages: vi.fn((entries: Array<{ id: number; slug: string; title: string }>) =>
    entries.map((entry) => ({ ...entry }))
  )
}));

import {
  getFirstOrganizationContentSidebarEntry,
  getContentComments,
  getContentEntryBySlug,
  getOrganizationContentPageBySlug,
  listContentSidebarEntries
} from './get-content';

describe('get-content helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('loads content comments with auth and tenant headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 91,
          contentEntryId: 123,
          authorUserId: 9,
          authorDisplayName: 'Jordan Lee',
          authorPhotoUrl: null,
          bodyMarkdown: 'Looks good.',
          createdAt: '2026-03-28T12:00:00.000Z',
          updatedAt: '2026-03-28T12:00:00.000Z',
          canDelete: true
        }
      ]
    });

    const comments = await getContentComments(123);

    expect(comments).toHaveLength(1);
    expect(comments[0]?.id).toBe(91);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/pages/123/comments',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          Authorization: 'Bearer cookie-token',
          'Content-Type': 'application/json',
          'x-tenant-id': '456'
        })
      })
    );
  });

  it('loads sidebar entries without fetching full content bodies', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 12,
          organizationId: 456,
          projectId: null,
          parentId: null,
          title: 'Home',
          slug: 'home',
          position: 0,
          updatedBy: 9,
          updatedByDisplayName: 'Jordan Lee',
          updatedByPhotoUrl: null,
          updatedAt: '2026-03-28T12:00:00.000Z'
        }
      ]
    });

    const entries = await listContentSidebarEntries();

    expect(entries).toEqual([
      expect.objectContaining({
        id: 12,
        slug: 'home',
        title: 'Home'
      })
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/pages/nav',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store'
      })
    );
  });

  it('loads a selected content entry by slug within the provided scope', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 12,
        organizationId: 456,
        projectId: 88,
        parentId: null,
        title: 'Setup',
        slug: 'setup',
        revision: '2026-03-28T12:00:00.000Z',
        contentMarkdown: '# Setup',
        position: 0,
        createdBy: 9,
        updatedBy: 9,
        updatedByDisplayName: 'Jordan Lee',
        updatedByPhotoUrl: null,
        createdAt: '2026-03-28T11:00:00.000Z',
        updatedAt: '2026-03-28T12:00:00.000Z'
      })
    });

    const entry = await getContentEntryBySlug({ slug: 'setup', projectId: 88 });

    expect(entry.slug).toBe('setup');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/pages/by-slug/setup?projectId=88',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store'
      })
    );
  });

  it('skips project-scoped sidebar entries when choosing the first organization page', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 12,
          organizationId: 456,
          projectId: null,
          parentId: null,
          title: 'Home',
          slug: 'home',
          position: 1,
          updatedBy: 9,
          updatedByDisplayName: 'Jordan Lee',
          updatedByPhotoUrl: null,
          updatedAt: '2026-03-28T12:00:00.000Z'
        }
      ]
    });

    const entry = await getFirstOrganizationContentSidebarEntry();

    expect(entry?.slug).toBe('home');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/pages/nav?scope=organization',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store'
      })
    );
  });

  it('keeps project-scoped sidebar entries out of organization page navigation', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 12,
            organizationId: 456,
            projectId: null,
            parentId: null,
            title: 'Home',
            slug: 'home',
            position: 1,
            updatedBy: 9,
            updatedByDisplayName: 'Jordan Lee',
            updatedByPhotoUrl: null,
            updatedAt: '2026-03-28T12:00:00.000Z'
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 12,
          organizationId: 456,
          projectId: null,
          parentId: null,
          title: 'Home',
          slug: 'home',
          revision: '2026-03-28T12:00:00.000Z',
          contentMarkdown: '# Home',
          position: 1,
          createdBy: 9,
          updatedBy: 9,
          updatedByDisplayName: 'Jordan Lee',
          updatedByPhotoUrl: null,
          createdAt: '2026-03-28T11:00:00.000Z',
          updatedAt: '2026-03-28T12:00:00.000Z'
        })
      });

    const pages = await getOrganizationContentPageBySlug('home');

    expect(pages.map((page) => page.slug)).toEqual(['home']);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/v1/pages/nav?scope=organization',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store'
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/api/v1/pages/by-slug/home?scope=organization',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store'
      })
    );
  });
});

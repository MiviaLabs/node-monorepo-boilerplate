import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectsRouter } from './projects';
import {
  PROJECT_SORT_BY,
  PROJECT_SORT_ORDER,
  PROJECT_VISIBILITY
} from '../../../types/project.types';

vi.mock('~/lib/auth/server-request-auth', () => ({
  resolveServerRequestAuthContextFromHeaders: vi.fn(async (headers: Headers) => {
    const cookie = headers.get('cookie') ?? '';
    if (cookie.includes('accessToken=cookie-token') && cookie.includes('tenantId=cookie-tenant')) {
      return { accessToken: 'cookie-token', tenantId: 'cookie-tenant' };
    }
    return null;
  })
}));

vi.mock('~/lib/runtime-config', () => ({
  getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3000/api/v1')
}));

global.fetch = vi.fn();

describe('projectsRouter', () => {
  const mockHeaders = new Headers({
    authorization: 'Bearer mock-token',
    'x-tenant-id': 'tenant-123'
  });

  const mockContext = {
    headers: mockHeaders
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists projects with pagination, filters, and sorting', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          data: [
            {
              id: 12,
              organizationId: 33,
              createdBy: 44,
              name: 'Control Tower',
              visibility: 'public',
              isMember: true,
              createdAt: '2026-03-15T00:00:00.000Z',
              updatedAt: '2026-03-15T00:00:00.000Z'
            }
          ],
          metadata: {
            pagination: {
              page: 2,
              pageSize: 10,
              total: 11,
              totalPages: 2,
              hasNext: false,
              hasPrevious: true
            }
          }
        }
      })
    });

    const caller = projectsRouter.createCaller(mockContext);
    const result = await caller.list({
      page: 2,
      pageSize: 10,
      search: 'tower',
      visibility: PROJECT_VISIBILITY.PUBLIC,
      sortBy: PROJECT_SORT_BY.NAME,
      sortOrder: PROJECT_SORT_ORDER.ASC
    });

    expect(result.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
      hasNext: false,
      hasPrevious: true
    });
    expect(result.data[0]).toMatchObject({
      id: '12',
      organizationId: '33',
      createdBy: '44',
      name: 'Control Tower',
      visibility: PROJECT_VISIBILITY.PUBLIC,
      isMember: true
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/spaces?page=2&pageSize=10&sortBy=name&sortOrder=asc&search=tower&visibility=public',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token',
          'x-tenant-id': 'tenant-123'
        })
      })
    );
  });

  it('creates a project', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 12,
          organizationId: 33,
          createdBy: 44,
          name: 'Atlas',
          visibility: 'private',
          createdAt: '2026-03-15T00:00:00.000Z',
          updatedAt: '2026-03-15T00:00:00.000Z'
        }
      })
    });

    const caller = projectsRouter.createCaller(mockContext);
    const result = await caller.create({
      name: '  Atlas  ',
      visibility: PROJECT_VISIBILITY.PRIVATE
    });

    expect(result).toMatchObject({
      id: '12',
      name: 'Atlas',
      visibility: PROJECT_VISIBILITY.PRIVATE
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/spaces',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Atlas',
          visibility: PROJECT_VISIBILITY.PRIVATE
        })
      })
    );
  });

  it('gets a single project by id', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 12,
          organizationId: 33,
          createdBy: 44,
          name: 'Atlas',
          visibility: 'private',
          createdAt: '2026-03-15T00:00:00.000Z',
          updatedAt: '2026-03-16T00:00:00.000Z'
        }
      })
    });

    const caller = projectsRouter.createCaller(mockContext);
    const result = await caller.get({ projectId: '12' });

    expect(result).toMatchObject({
      id: '12',
      organizationId: '33',
      createdBy: '44',
      name: 'Atlas',
      visibility: PROJECT_VISIBILITY.PRIVATE
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/spaces/12',
      expect.objectContaining({
        method: 'GET'
      })
    );
  });

  it('lists project members', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            userId: 44,
            displayName: 'Jane Doe',
            photoUrl: 'https://cdn.example.com/jane.png',
            isCreator: true,
            assignedAt: '2026-03-18T10:00:00.000Z'
          }
        ]
      })
    });

    const caller = projectsRouter.createCaller(mockContext);
    const result = await caller.listMembers({ projectId: '12' });

    expect(result).toEqual([
      {
        userId: '44',
        displayName: 'Jane Doe',
        photoUrl: 'https://cdn.example.com/jane.png',
        isCreator: true,
        assignedAt: '2026-03-18T10:00:00.000Z'
      }
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/spaces/12/members',
      expect.objectContaining({
        method: 'GET'
      })
    );
  });

  it('lists project members in bulk', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          '12': [
            {
              userId: 44,
              displayName: 'Jane Doe',
              photoUrl: null,
              isCreator: true,
              assignedAt: '2026-03-18T10:00:00.000Z'
            }
          ],
          '13': []
        }
      })
    });

    const caller = projectsRouter.createCaller(mockContext);
    const result = await caller.listMembersBulk({ projectIds: ['12', '13', '12'] });

    expect(result).toEqual({
      '12': [
        {
          userId: '44',
          displayName: 'Jane Doe',
          photoUrl: null,
          isCreator: true,
          assignedAt: '2026-03-18T10:00:00.000Z'
        }
      ],
      '13': []
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/spaces/members/bulk?projectIds=12%2C13',
      expect.objectContaining({
        method: 'GET'
      })
    );
  });

  it('adds a project member', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          userId: 55,
          displayName: 'John Smith',
          photoUrl: null,
          isCreator: false,
          assignedAt: '2026-03-18T11:00:00.000Z'
        }
      })
    });

    const caller = projectsRouter.createCaller(mockContext);
    const result = await caller.addMember({ projectId: '12', userId: 55 });

    expect(result).toEqual({
      userId: '55',
      displayName: 'John Smith',
      photoUrl: null,
      isCreator: false,
      assignedAt: '2026-03-18T11:00:00.000Z'
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/spaces/12/members',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId: 55 })
      })
    );
  });

  it('removes a project member', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => ({})
    });

    const caller = projectsRouter.createCaller(mockContext);
    await caller.removeMember({ projectId: '12', memberId: '55' });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/spaces/12/members/55',
      expect.objectContaining({
        method: 'DELETE'
      })
    );
  });

  it('uses cookie auth and tenant fallback', async () => {
    const cookieContext = {
      headers: new Headers({
        cookie: 'accessToken=cookie-token; tenantId=cookie-tenant'
      })
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          data: [],
          metadata: {
            pagination: {
              page: 1,
              pageSize: 20,
              total: 0,
              totalPages: 0,
              hasNext: false,
              hasPrevious: false
            }
          }
        }
      })
    });

    const caller = projectsRouter.createCaller(cookieContext);
    await caller.list({ page: 1, pageSize: 20 });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer cookie-token',
          'x-tenant-id': 'cookie-tenant'
        })
      })
    );
  });

  it('rejects unauthenticated requests', async () => {
    const caller = projectsRouter.createCaller({
      headers: new Headers({
        'x-tenant-id': 'tenant-123'
      })
    });

    await expect(caller.list({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    } satisfies Partial<TRPCError>);
  });
});

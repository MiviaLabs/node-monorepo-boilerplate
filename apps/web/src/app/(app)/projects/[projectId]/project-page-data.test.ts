import { TRPCClientError } from '@trpc/client';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enum TrpcErrorCode {
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED'
}

const {
  redirectMock,
  getUserSessionMock,
  getDashboardRouteAccessMock,
  createServerTrpcClientMock
} = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  getUserSessionMock: vi.fn(),
  getDashboardRouteAccessMock: vi.fn(),
  createServerTrpcClientMock: vi.fn()
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

vi.mock('~/lib/auth/get-user-session', () => ({
  getUserSession: getUserSessionMock
}));

vi.mock('~/components/dashboard/route-access', () => ({
  getDashboardRouteAccess: getDashboardRouteAccessMock
}));

vi.mock('~/lib/trpc/create-server-trpc-client', () => ({
  createServerTrpcClient: createServerTrpcClientMock
}));

import { getAuthorizedProjectData, getAuthorizedProjectPageData } from './project-page-data';

function createTrpcError(code: TrpcErrorCode) {
  return Object.assign(new TRPCClientError(code), {
    data: { code }
  });
}

function createDirectTrpcError(code: TrpcErrorCode) {
  return new TRPCError({
    code
  });
}

describe('getAuthorizedProjectPageData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((href: string) => {
      throw new Error(`redirect:${href}`);
    });
    getUserSessionMock.mockResolvedValue({
      user: {
        userId: '7',
        roles: [],
        permissions: ['projects:view']
      }
    });
    getDashboardRouteAccessMock.mockReturnValue({
      canViewProjects: true
    });
  });

  it('returns project access data without loading members for base routes', async () => {
    const projectGetQuery = vi.fn().mockResolvedValue({ id: '42', name: 'Atlas' });
    const projectListMembersQuery = vi.fn();
    createServerTrpcClientMock.mockResolvedValue({
      projects: {
        get: {
          query: projectGetQuery
        },
        listMembers: {
          query: projectListMembersQuery
        }
      }
    });

    await expect(getAuthorizedProjectData('42')).resolves.toEqual({
      project: { id: '42', name: 'Atlas' },
      user: expect.objectContaining({ userId: '7' })
    });
    expect(projectGetQuery).toHaveBeenCalledWith({ projectId: '42' });
    expect(projectListMembersQuery).not.toHaveBeenCalled();
  });

  it('keeps the project page accessible when member listing is forbidden', async () => {
    const project = { id: '42', name: 'Atlas' };
    createServerTrpcClientMock.mockResolvedValue({
      projects: {
        get: {
          query: vi.fn().mockResolvedValue(project)
        },
        listMembers: {
          query: vi.fn().mockRejectedValue(createTrpcError(TrpcErrorCode.FORBIDDEN))
        }
      }
    });

    await expect(getAuthorizedProjectPageData('42')).resolves.toEqual({
      canViewProjectMembers: false,
      members: [],
      project,
      user: expect.objectContaining({ userId: '7' })
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('resets context when the project itself is unavailable', async () => {
    createServerTrpcClientMock.mockResolvedValue({
      projects: {
        get: {
          query: vi.fn().mockRejectedValue(createTrpcError(TrpcErrorCode.FORBIDDEN))
        },
        listMembers: {
          query: vi.fn()
        }
      }
    });

    await expect(getAuthorizedProjectPageData('42')).rejects.toThrow(
      'redirect:/projects?projectContext=unavailable'
    );
    expect(redirectMock).toHaveBeenCalledWith('/projects?projectContext=unavailable');
  });

  it('treats direct caller trpc errors the same as client errors for member access', async () => {
    const project = { id: '42', name: 'Atlas' };
    createServerTrpcClientMock.mockResolvedValue({
      projects: {
        get: {
          query: vi.fn().mockResolvedValue(project)
        },
        listMembers: {
          query: vi.fn().mockRejectedValue(createDirectTrpcError(TrpcErrorCode.FORBIDDEN))
        }
      }
    });

    await expect(getAuthorizedProjectPageData('42')).resolves.toEqual({
      canViewProjectMembers: false,
      members: [],
      project,
      user: expect.objectContaining({ userId: '7' })
    });
  });
});

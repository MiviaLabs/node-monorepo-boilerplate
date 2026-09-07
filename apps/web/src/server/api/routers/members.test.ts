/**
 * Members Router Unit Tests
 *
 * Tests for members tRPC procedures with P0 multi-tenancy validation
 */
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { membersRouter } from './members';

import type { InviteMemberResponse, MembersResponse, TenantMember } from '~/types/tenant.types';

import { MemberStatus, TENANT_ROLES } from '~/types/tenant.types';

vi.mock('~/lib/auth/server-request-auth', () => ({
  resolveServerRequestAuthContextFromHeaders: vi.fn(async (headers: Headers) => {
    const cookie = headers.get('cookie') ?? '';
    if (cookie.includes('accessToken=cookie-token') && cookie.includes('tenantId=cookie-tenant')) {
      return { accessToken: 'cookie-token', tenantId: 'cookie-tenant' };
    }
    return null;
  })
}));

// Mock getApiUrl
vi.mock('~/lib/runtime-config', () => ({
  getApiUrl: vi.fn(() => 'http://localhost:3000/api'),
  getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3000/api/v1')
}));

// Mock global fetch
global.fetch = vi.fn();

describe('membersRouter', () => {
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

  describe('getMembers', () => {
    it('should fetch members with pagination', async () => {
      const mockResponse: MembersResponse = {
        data: [
          {
            id: 'member-1',
            userId: 'user-1',
            tenantId: 'tenant-123',
            email: 'user1@example.com',
            displayName: 'User One',
            photoUrl: 'https://signed.example.test/member-1.png',
            role: TENANT_ROLES.USER,
            status: MemberStatus.ACTIVE,
            isActive: true,
            isDefault: false,
            joinedAt: '2024-01-01T00:00:00Z'
          }
        ],
        meta: {
          page: 1,
          pageSize: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false
        }
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockResponse })
      });

      const caller = membersRouter.createCaller(mockContext);
      const result = await caller.getMembers({ page: 1, pageSize: 10 });

      expect(result).toEqual(mockResponse);
      expect(result.data[0]?.photoUrl).toBe('https://signed.example.test/member-1.png');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/workspaces/members?page=1&pageSize=10',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
            'x-tenant-id': 'tenant-123'
          })
        })
      );
    });

    it('should apply filters to query', async () => {
      const mockResponse: MembersResponse = {
        data: [],
        meta: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false
        }
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockResponse })
      });

      const caller = membersRouter.createCaller(mockContext);
      await caller.getMembers({
        page: 1,
        pageSize: 10,
        search: 'test',
        role: TENANT_ROLES.ADMIN,
        status: MemberStatus.ACTIVE
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=test'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('role=tenant_admin'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=active'),
        expect.any(Object)
      );
    });

    it('should enforce tenant scoping - throw UNAUTHORIZED without tenant header', async () => {
      const contextWithoutTenant = {
        headers: new Headers({
          authorization: 'Bearer mock-token'
        })
      };

      const caller = membersRouter.createCaller(contextWithoutTenant);

      await expect(caller.getMembers({ page: 1, pageSize: 10 })).rejects.toThrow(TRPCError);

      await expect(caller.getMembers({ page: 1, pageSize: 10 })).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });

    it('should enforce authentication - throw UNAUTHORIZED without auth token', async () => {
      const contextWithoutAuth = {
        headers: new Headers({
          'x-tenant-id': 'tenant-123'
        })
      };

      const caller = membersRouter.createCaller(contextWithoutAuth);

      await expect(caller.getMembers({ page: 1, pageSize: 10 })).rejects.toThrow(TRPCError);

      await expect(caller.getMembers({ page: 1, pageSize: 10 })).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });

    it('should use accessToken and tenantId from cookies when headers are missing', async () => {
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
            meta: {
              page: 1,
              pageSize: 10,
              total: 0,
              totalPages: 0,
              hasNext: false,
              hasPrevious: false
            }
          }
        })
      });

      const caller = membersRouter.createCaller(cookieContext);
      await caller.getMembers({ page: 1, pageSize: 10 });

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
  });

  describe('inviteMember', () => {
    it('should invite member with valid email', async () => {
      const mockResponse: InviteMemberResponse = {
        memberId: 'member-123',
        email: 'newuser@example.com',
        invitationToken: 'token-123',
        status: 'pending'
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockResponse })
      });

      const caller = membersRouter.createCaller(mockContext);
      const result = await caller.inviteMember({
        email: 'newuser@example.com',
        roles: [TENANT_ROLES.USER]
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/workspaces/members/invite',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'newuser@example.com',
            roles: [TENANT_ROLES.USER]
          })
        })
      );
    });

    it('should reject invalid email format', async () => {
      const caller = membersRouter.createCaller(mockContext);

      await expect(caller.inviteMember({ email: 'invalid-email' })).rejects.toThrow();
    });

    it('should enforce tenant scoping on invite', async () => {
      const contextWithoutTenant = {
        headers: new Headers({
          authorization: 'Bearer mock-token'
        })
      };

      const caller = membersRouter.createCaller(contextWithoutTenant);

      await expect(caller.inviteMember({ email: 'test@example.com' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });
  });

  describe('updateMemberRole', () => {
    it('should update member role', async () => {
      const memberId = '42';
      const mockMember: TenantMember = {
        id: memberId,
        userId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        tenantId: 'tenant-123',
        email: 'user@example.com',
        role: TENANT_ROLES.ADMIN,
        status: MemberStatus.ACTIVE,
        isActive: true,
        isDefault: false,
        joinedAt: '2024-01-01T00:00:00Z'
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockMember })
      });

      const caller = membersRouter.createCaller(mockContext);
      const result = await caller.updateMemberRole({
        memberId,
        role: TENANT_ROLES.ADMIN
      });

      expect(result).toEqual(mockMember);
      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/workspaces/members/${memberId}/role`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ role: TENANT_ROLES.ADMIN })
        })
      );
    });

    it('should reject invalid member ID format', async () => {
      const caller = membersRouter.createCaller(mockContext);

      await expect(
        caller.updateMemberRole({
          memberId: 'invalid-id',
          role: TENANT_ROLES.ADMIN
        })
      ).rejects.toThrow();
    });

    it('should enforce tenant scoping on role update', async () => {
      const contextWithoutTenant = {
        headers: new Headers({
          authorization: 'Bearer mock-token'
        })
      };

      const caller = membersRouter.createCaller(contextWithoutTenant);

      await expect(
        caller.updateMemberRole({
          memberId: '42',
          role: TENANT_ROLES.ADMIN
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });
  });

  describe('updateMemberStatus', () => {
    it('should update member status', async () => {
      const memberId = '43';
      const mockMember: TenantMember = {
        id: memberId,
        userId: 'd4e5f6a7-b890-4234-bcde-234567890123',
        tenantId: 'tenant-123',
        email: 'user@example.com',
        role: TENANT_ROLES.USER,
        status: MemberStatus.SUSPENDED,
        isActive: false,
        isDefault: false,
        joinedAt: '2024-01-01T00:00:00Z'
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockMember })
      });

      const caller = membersRouter.createCaller(mockContext);
      const result = await caller.updateMemberStatus({
        memberId,
        status: MemberStatus.SUSPENDED
      });

      expect(result).toEqual(mockMember);
      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/workspaces/members/${memberId}/status`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: MemberStatus.SUSPENDED })
        })
      );
    });

    it('should enforce tenant scoping on status update', async () => {
      const contextWithoutTenant = {
        headers: new Headers({
          authorization: 'Bearer mock-token'
        })
      };

      const caller = membersRouter.createCaller(contextWithoutTenant);

      await expect(
        caller.updateMemberStatus({
          memberId: '43',
          status: MemberStatus.ACTIVE
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });
  });

  describe('deleteMember', () => {
    it('should delete member', async () => {
      const memberId = '44';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      const caller = membersRouter.createCaller(mockContext);
      const result = await caller.deleteMember({
        memberId
      });

      expect(result).toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:3000/api/v1/workspaces/members/${memberId}`,
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });

    it('should handle 404 for non-existent member', async () => {
      const memberId = '999999';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Member not found' })
      });

      const caller = membersRouter.createCaller(mockContext);

      await expect(caller.deleteMember({ memberId })).rejects.toMatchObject({
        code: 'NOT_FOUND'
      });
    });

    it('should enforce tenant scoping on delete', async () => {
      const contextWithoutTenant = {
        headers: new Headers({
          authorization: 'Bearer mock-token'
        })
      };

      const caller = membersRouter.createCaller(contextWithoutTenant);

      await expect(
        caller.deleteMember({
          memberId: '44'
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    });
  });

  describe('resendInvitation', () => {
    it('should call resend invitation endpoint', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            invitationId: 77,
            invitationToken: 'rotated-token-123',
            emailDispatched: false
          }
        })
      });

      const caller = membersRouter.createCaller(mockContext);
      const result = await caller.resendInvitation({ invitationId: '77' });

      expect(result).toEqual({
        invitationId: 77,
        invitationToken: 'rotated-token-123',
        emailDispatched: false
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/workspaces/members/invitations/77/resend',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should support response without token when email is dispatched', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            invitationId: 77,
            emailDispatched: true
          }
        })
      });

      const caller = membersRouter.createCaller(mockContext);
      const result = await caller.resendInvitation({ invitationId: '77' });

      expect(result).toEqual({
        invitationId: 77,
        emailDispatched: true
      });
    });

    it('should reject invalid invitationId format', async () => {
      const caller = membersRouter.createCaller(mockContext);
      await expect(caller.resendInvitation({ invitationId: 'invalid-id' })).rejects.toThrow();
    });

    it('should map resend 404 to NOT_FOUND', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Invitation not found' })
      });

      const caller = membersRouter.createCaller(mockContext);
      await expect(caller.resendInvitation({ invitationId: '77' })).rejects.toMatchObject({
        code: 'NOT_FOUND'
      });
    });
  });

  describe('P0 Security Requirements', () => {
    it('should always include x-tenant-id header in requests', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { data: [], meta: {} } })
      });

      const caller = membersRouter.createCaller(mockContext);
      await caller.getMembers({ page: 1, pageSize: 10 });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-tenant-id': 'tenant-123'
          })
        })
      );
    });

    it('should always include authorization header in requests', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { data: [], meta: {} } })
      });

      const caller = membersRouter.createCaller(mockContext);
      await caller.getMembers({ page: 1, pageSize: 10 });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token'
          })
        })
      );
    });

    it('should not log PII - only member IDs in errors', async () => {
      // First mock for the actual call
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Forbidden' })
      }));

      const caller = membersRouter.createCaller(mockContext);

      // Should reject with FORBIDDEN error
      const error = await caller.getMembers({ page: 1, pageSize: 10 }).catch((e) => e);

      expect(error).toMatchObject({
        code: 'FORBIDDEN'
      });

      // Error message should not contain email or other PII
      expect(error.message).not.toContain('@');
    });
  });
});

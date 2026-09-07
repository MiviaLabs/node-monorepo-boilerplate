/**
 * Unit tests for optimistic updates utilities
 *
 * Tests all 5 handlers with success/error paths and edge cases
 * Target: 80%+ line coverage
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { toast } from 'sonner';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  handleOptimisticRoleUpdate,
  handleOptimisticStatusUpdate,
  handleOptimisticDelete,
  handleMutationError,
  handleMutationSuccess,
  TOAST_DURATION_MS,
  SUCCESS_TOAST_CONFIG,
  ERROR_TOAST_CONFIG
} from './optimistic-updates';

import type { TRPCClientErrorLike } from '@trpc/client';
import type { AppRouter } from '~/server/api/routers/_app';
import type { TenantMember } from '~/types/tenant.types';

import { MemberStatus, TENANT_ROLES } from '~/types/tenant.types';

// ============================================================================
// MOCKS
// ============================================================================

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

// ============================================================================
// TEST FIXTURES
// ============================================================================

/** Create test member fixture */
function createMockMember(overrides: Partial<TenantMember> = {}): TenantMember {
  return {
    id: 'member-1',
    userId: 'user-1',
    tenantId: 'tenant-123',
    email: 'user1@example.com',
    displayName: 'User One',
    role: TENANT_ROLES.USER,
    status: MemberStatus.ACTIVE,
    isActive: true,
    isDefault: false,
    joinedAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    permissions: [],
    ...overrides
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('optimistic-updates', () => {
  // Mock QueryClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test mock type
  let mockQueryClient: any;
  let mockMembers: TenantMember[];

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock members data
    mockMembers = [
      createMockMember({ id: 'member-1', email: 'user1@example.com', role: TENANT_ROLES.USER }),
      createMockMember({ id: 'member-2', email: 'user2@example.com', role: TENANT_ROLES.ADMIN })
    ];

    // Mock QueryClient methods
    mockQueryClient = {
      getQueryData: vi.fn(() => [...mockMembers]),
      setQueryData: vi.fn((key, updater) => {
        const current = mockQueryClient.getQueryData(key);
        const updated = typeof updater === 'function' ? updater(current) : updater;
        return updated;
      }),
      invalidateQueries: vi.fn(() => Promise.resolve())
    };
  });

  describe('handleOptimisticRoleUpdate', () => {
    it('should update member role in cache optimistically with tenant ID', () => {
      const context = handleOptimisticRoleUpdate(
        mockQueryClient,
        'member-1',
        TENANT_ROLES.ADMIN,
        'tenant-123'
      );

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['members', 'tenant-123'],
        expect.any(Function)
      );
      expect(context.previousMembers).toEqual(mockMembers);
    });

    it('should update member role in cache optimistically without tenant ID', () => {
      const context = handleOptimisticRoleUpdate(mockQueryClient, 'member-1', TENANT_ROLES.ADMIN);

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(['members'], expect.any(Function));
      expect(context.previousMembers).toEqual(mockMembers);
    });

    it('should correctly update the specified member role', () => {
      handleOptimisticRoleUpdate(mockQueryClient, 'member-1', TENANT_ROLES.ADMIN, 'tenant-123');

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test assertion
      const setDataFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const updatedMembers = setDataFn(mockMembers);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test assertion
      expect(updatedMembers[0]!.role).toBe(TENANT_ROLES.ADMIN);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test assertion
      expect(updatedMembers[1]!.role).toBe(TENANT_ROLES.ADMIN);
    });

    it('should not modify other members when updating role', () => {
      handleOptimisticRoleUpdate(mockQueryClient, 'member-1', TENANT_ROLES.ADMIN, 'tenant-123');

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test assertion
      const setDataFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const updatedMembers = setDataFn(mockMembers);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test assertion
      expect(updatedMembers[1]!.id).toBe('member-2');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test assertion
      expect(updatedMembers[1]!.email).toBe('user2@example.com');
    });

    it('should handle undefined members array gracefully', () => {
      mockQueryClient.getQueryData = vi.fn(() => undefined);

      const context = handleOptimisticRoleUpdate(mockQueryClient, 'member-1', TENANT_ROLES.ADMIN);

      expect(context.previousMembers).toBeUndefined();
    });

    it('should return empty array when updating undefined cache', () => {
      mockQueryClient.getQueryData = vi.fn(() => undefined);

      handleOptimisticRoleUpdate(mockQueryClient, 'member-1', TENANT_ROLES.ADMIN, 'tenant-123');

      const setDataFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const result = setDataFn(undefined);

      expect(result).toEqual([]);
    });
  });

  describe('handleOptimisticStatusUpdate', () => {
    it('should update member status in cache optimistically with tenant ID', () => {
      const context = handleOptimisticStatusUpdate(
        mockQueryClient,
        'member-1',
        MemberStatus.SUSPENDED,
        'tenant-123'
      );

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['members', 'tenant-123'],
        expect.any(Function)
      );
      expect(context.previousMembers).toEqual(mockMembers);
    });

    it('should update member status in cache optimistically without tenant ID', () => {
      const context = handleOptimisticStatusUpdate(
        mockQueryClient,
        'member-1',
        MemberStatus.INACTIVE
      );

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(['members'], expect.any(Function));
      expect(context.previousMembers).toEqual(mockMembers);
    });

    it('should correctly update the specified member status', () => {
      handleOptimisticStatusUpdate(
        mockQueryClient,
        'member-1',
        MemberStatus.SUSPENDED,
        'tenant-123'
      );

      const setDataFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const updatedMembers = setDataFn(mockMembers);

      expect(updatedMembers[0].status).toBe(MemberStatus.SUSPENDED);
    });

    it('should not modify other members when updating status', () => {
      handleOptimisticStatusUpdate(
        mockQueryClient,
        'member-1',
        MemberStatus.SUSPENDED,
        'tenant-123'
      );

      const setDataFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const updatedMembers = setDataFn(mockMembers);

      expect(updatedMembers[1].status).toBe(MemberStatus.ACTIVE);
    });

    it('should handle undefined members array gracefully', () => {
      mockQueryClient.getQueryData = vi.fn(() => undefined);

      const context = handleOptimisticStatusUpdate(
        mockQueryClient,
        'member-1',
        MemberStatus.SUSPENDED
      );

      expect(context.previousMembers).toBeUndefined();
    });
  });

  describe('handleOptimisticDelete', () => {
    it('should remove member from cache optimistically with tenant ID', () => {
      const context = handleOptimisticDelete(mockQueryClient, 'member-1', 'tenant-123');

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['members', 'tenant-123'],
        expect.any(Function)
      );
      expect(context.previousMembers).toEqual(mockMembers);
    });

    it('should remove member from cache optimistically without tenant ID', () => {
      const context = handleOptimisticDelete(mockQueryClient, 'member-1');

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(['members'], expect.any(Function));
      expect(context.previousMembers).toEqual(mockMembers);
    });

    it('should correctly remove the specified member', () => {
      handleOptimisticDelete(mockQueryClient, 'member-1', 'tenant-123');

      const setDataFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const updatedMembers = setDataFn(mockMembers);

      expect(updatedMembers).toHaveLength(1);
      expect(updatedMembers[0].id).toBe('member-2');
    });

    it('should not affect other members when deleting', () => {
      handleOptimisticDelete(mockQueryClient, 'member-1', 'tenant-123');

      const setDataFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const updatedMembers = setDataFn(mockMembers);

      expect(updatedMembers[0].email).toBe('user2@example.com');
    });

    it('should handle undefined members array gracefully', () => {
      mockQueryClient.getQueryData = vi.fn(() => undefined);

      const context = handleOptimisticDelete(mockQueryClient, 'member-1');

      expect(context.previousMembers).toBeUndefined();
    });

    it('should return empty array when deleting from undefined cache', () => {
      mockQueryClient.getQueryData = vi.fn(() => undefined);

      handleOptimisticDelete(mockQueryClient, 'member-1', 'tenant-123');

      const setDataFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const result = setDataFn(undefined);

      expect(result).toEqual([]);
    });
  });

  describe('handleMutationError', () => {
    it('should rollback to previous members on error with tenant ID', () => {
      const context = { previousMembers: mockMembers };
      const error = { message: 'Network error' } as TRPCClientErrorLike<AppRouter>;

      handleMutationError(mockQueryClient, context, error, 'update member role', 'tenant-123');

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['members', 'tenant-123'],
        expect.any(Function)
      );
      expect(toast.error).toHaveBeenCalledWith('Error: Network error', ERROR_TOAST_CONFIG);
    });

    it('should rollback to previous members on error without tenant ID', () => {
      const context = { previousMembers: mockMembers };
      const error = { message: 'API Error' } as TRPCClientErrorLike<AppRouter>;

      handleMutationError(mockQueryClient, context, error, 'delete member');

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(['members'], expect.any(Function));
      expect(toast.error).toHaveBeenCalledWith('Error: API Error', ERROR_TOAST_CONFIG);
    });

    it('should verify rollback function returns previous state', () => {
      const context = { previousMembers: mockMembers };
      const error = { message: 'Error' } as TRPCClientErrorLike<AppRouter>;

      handleMutationError(mockQueryClient, context, error, 'test operation', 'tenant-123');

      const rollbackFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const rolledBack = rollbackFn();

      expect(rolledBack).toEqual(mockMembers);
    });

    it('should handle missing context gracefully', () => {
      const error = { message: 'Error' } as TRPCClientErrorLike<AppRouter>;

      handleMutationError(mockQueryClient, undefined, error, 'test operation');

      expect(mockQueryClient.setQueryData).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Error: Error', ERROR_TOAST_CONFIG);
    });

    it('should handle context without previousMembers', () => {
      const context = {};
      const error = { message: 'Error' } as TRPCClientErrorLike<AppRouter>;

      handleMutationError(mockQueryClient, context, error, 'test operation');

      expect(mockQueryClient.setQueryData).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Error: Error', ERROR_TOAST_CONFIG);
    });

    it('should use default error message if none provided', () => {
      const error = {} as TRPCClientErrorLike<AppRouter>;

      handleMutationError(mockQueryClient, undefined, error, 'test operation');

      expect(toast.error).toHaveBeenCalledWith(
        'Error: Failed to test operation',
        ERROR_TOAST_CONFIG
      );
    });

    it('should use default error message for empty string', () => {
      const error = { message: '' } as TRPCClientErrorLike<AppRouter>;

      handleMutationError(mockQueryClient, undefined, error, 'update member');

      expect(toast.error).toHaveBeenCalledWith(
        'Error: Failed to update member',
        ERROR_TOAST_CONFIG
      );
    });

    it('should include operation name in default error message', () => {
      const error = {} as TRPCClientErrorLike<AppRouter>;

      handleMutationError(mockQueryClient, undefined, error, 'delete member');

      expect(toast.error).toHaveBeenCalledWith(
        'Error: Failed to delete member',
        ERROR_TOAST_CONFIG
      );
    });

    it('should use correct toast duration from config', () => {
      const error = { message: 'Error' } as TRPCClientErrorLike<AppRouter>;

      handleMutationError(mockQueryClient, undefined, error, 'test');

      expect(toast.error).toHaveBeenCalledWith(expect.any(String), { duration: TOAST_DURATION_MS });
    });
  });

  describe('handleMutationSuccess', () => {
    it('should show success toast and invalidate queries with tenant ID', async () => {
      await handleMutationSuccess(mockQueryClient, 'updated member role', 'tenant-123');

      expect(toast.success).toHaveBeenCalledWith(
        'Successfully updated member role',
        SUCCESS_TOAST_CONFIG
      );
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['members', 'tenant-123']
      });
    });

    it('should show success toast and invalidate queries without tenant ID', async () => {
      await handleMutationSuccess(mockQueryClient, 'deleted member');

      expect(toast.success).toHaveBeenCalledWith(
        'Successfully deleted member',
        SUCCESS_TOAST_CONFIG
      );
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['members']
      });
    });

    it('should use correct toast duration from config', async () => {
      await handleMutationSuccess(mockQueryClient, 'test operation');

      expect(toast.success).toHaveBeenCalledWith(expect.any(String), {
        duration: TOAST_DURATION_MS
      });
    });

    it('should return a promise that resolves', async () => {
      const result = handleMutationSuccess(mockQueryClient, 'test');

      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });
  });

  describe('Constants', () => {
    it('should export TOAST_DURATION_MS constant', () => {
      expect(TOAST_DURATION_MS).toBe(3000);
    });

    it('should export SUCCESS_TOAST_CONFIG with correct duration', () => {
      expect(SUCCESS_TOAST_CONFIG).toEqual({ duration: 3000 });
    });

    it('should export ERROR_TOAST_CONFIG with correct duration', () => {
      expect(ERROR_TOAST_CONFIG).toEqual({ duration: 3000 });
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Full optimistic update flow', () => {
    it('should update, rollback on error, and restore original state', () => {
      // Step 1: Optimistic update
      const context = handleOptimisticRoleUpdate(
        mockQueryClient,
        'member-1',
        TENANT_ROLES.ADMIN,
        'tenant-123'
      );

      expect(context.previousMembers).toBeDefined();
      expect(context.previousMembers).toEqual(mockMembers);

      // Step 2: Simulate error and rollback
      const error = { message: 'API Error' } as TRPCClientErrorLike<AppRouter>;
      handleMutationError(mockQueryClient, context, error, 'update role', 'tenant-123');

      // Step 3: Verify rollback happened
      const rollbackFn = mockQueryClient.setQueryData.mock.calls[1][1];
      const rolledBack = rollbackFn();

      expect(rolledBack).toEqual(context.previousMembers);
      expect(toast.error).toHaveBeenCalledWith('Error: API Error', ERROR_TOAST_CONFIG);
    });

    it('should update and show success toast on successful mutation', async () => {
      // Step 1: Optimistic update
      const context = handleOptimisticStatusUpdate(
        mockQueryClient,
        'member-1',
        MemberStatus.INACTIVE,
        'tenant-123'
      );

      expect(context.previousMembers).toBeDefined();

      // Step 2: Simulate success
      await handleMutationSuccess(mockQueryClient, 'updated member status', 'tenant-123');

      expect(toast.success).toHaveBeenCalledWith(
        'Successfully updated member status',
        SUCCESS_TOAST_CONFIG
      );
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['members', 'tenant-123']
      });
    });

    it('should delete, rollback on error, and restore deleted member', () => {
      // Step 1: Optimistic delete
      const context = handleOptimisticDelete(mockQueryClient, 'member-1', 'tenant-123');

      expect(context.previousMembers).toHaveLength(2);

      // Step 2: Verify optimistic deletion
      const deleteFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const afterDelete = deleteFn(mockMembers);

      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0].id).toBe('member-2');

      // Step 3: Simulate error and rollback
      const error = { message: 'Permission denied' } as TRPCClientErrorLike<AppRouter>;
      handleMutationError(mockQueryClient, context, error, 'delete member', 'tenant-123');

      // Step 4: Verify member was restored
      const rollbackFn = mockQueryClient.setQueryData.mock.calls[1][1];
      const rolledBack = rollbackFn();

      expect(rolledBack).toEqual(context.previousMembers);
      expect(rolledBack).toHaveLength(2);
    });

    it('should handle multiple sequential updates correctly', () => {
      // Update 1: Change role
      const context1 = handleOptimisticRoleUpdate(
        mockQueryClient,
        'member-1',
        TENANT_ROLES.ADMIN,
        'tenant-123'
      );

      // Update 2: Change status
      const context2 = handleOptimisticStatusUpdate(
        mockQueryClient,
        'member-2',
        MemberStatus.SUSPENDED,
        'tenant-123'
      );

      // Both contexts should preserve original state
      expect(context1.previousMembers).toEqual(mockMembers);
      expect(context2.previousMembers).toEqual(mockMembers);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty members array', () => {
      mockQueryClient.getQueryData = vi.fn(() => []);

      const context = handleOptimisticRoleUpdate(mockQueryClient, 'member-1', TENANT_ROLES.ADMIN);

      expect(context.previousMembers).toEqual([]);
    });

    it('should handle member ID that does not exist', () => {
      handleOptimisticRoleUpdate(
        mockQueryClient,
        'nonexistent-id',
        TENANT_ROLES.ADMIN,
        'tenant-123'
      );

      const setDataFn = mockQueryClient.setQueryData.mock.calls[0]![1];
      const result = setDataFn(mockMembers);

      // Should return unchanged array when member not found
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe(TENANT_ROLES.USER);
      expect(result[1].role).toBe(TENANT_ROLES.ADMIN);
    });

    it('should handle invalidateQueries rejection gracefully', async () => {
      const error = new Error('Cache invalidation failed');
      mockQueryClient.invalidateQueries = vi.fn(() => Promise.reject(error));

      await expect(handleMutationSuccess(mockQueryClient, 'test', 'tenant-123')).rejects.toThrow(
        'Cache invalidation failed'
      );
    });
  });
});

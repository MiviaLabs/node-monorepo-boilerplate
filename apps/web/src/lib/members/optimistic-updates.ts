/**
 * Optimistic Updates for Member Mutations
 *
 * Provides optimistic update utilities for member management operations
 * Instant UI feedback with automatic rollback on error
 */

import { toast } from 'sonner';

import type { QueryClient as ReactQueryClient } from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { AppRouter } from '~/server/api/routers/_app';
import type { MemberStatus, TenantMember, TenantRole } from '~/types/tenant.types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Previous state for rollback on error
 */
interface OptimisticContext {
  /** Previous members list for rollback */
  previousMembers?: TenantMember[];
  /** Previous query snapshots for rollback across all members.getMembers cache variants */
  previousSnapshots?: Array<{
    queryKey: readonly unknown[];
    data: MembersQueryData | undefined;
  }>;
}

type QueryClient = Pick<ReactQueryClient, 'getQueryData' | 'setQueryData' | 'invalidateQueries'> &
  Partial<Pick<ReactQueryClient, 'getQueriesData' | 'setQueriesData'>>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Query key for members list cache */
const MEMBERS_QUERY_KEY = 'members' as const;
const MEMBERS_GET_MEMBERS_QUERY_PATH = ['members', 'getMembers'] as const;

/** Toast duration in milliseconds */
const TOAST_DURATION_MS = 3000;

/** Success toast configuration */
const SUCCESS_TOAST_CONFIG = {
  duration: TOAST_DURATION_MS
} as const;

/** Error toast configuration */
const ERROR_TOAST_CONFIG = {
  duration: TOAST_DURATION_MS
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build tenant-scoped query key for members cache
 *
 * Ensures multi-tenancy isolation by including tenant ID in query key
 *
 * @param tenantId - Optional tenant ID for scoping
 * @returns Query key array for React Query cache
 */
function getMembersQueryKey(tenantId?: string): unknown[] {
  return tenantId ? [MEMBERS_QUERY_KEY, tenantId] : [MEMBERS_QUERY_KEY];
}

type MembersQueryData = TenantMember[] | { data: TenantMember[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasMembersGetMembersPath(value: unknown): boolean {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length - 1; i += 1) {
      if (
        value[i] === MEMBERS_GET_MEMBERS_QUERY_PATH[0] &&
        value[i + 1] === MEMBERS_GET_MEMBERS_QUERY_PATH[1]
      ) {
        return true;
      }
    }
    return value.some((item) => hasMembersGetMembersPath(item));
  }

  if (!isObject(value)) {
    return false;
  }

  return Object.values(value).some((nested) => hasMembersGetMembersPath(nested));
}

function applyMembersUpdater(
  old: MembersQueryData | undefined,
  updater: (members: TenantMember[]) => TenantMember[]
): MembersQueryData | undefined {
  if (Array.isArray(old)) {
    return updater(old);
  }

  if (isObject(old) && Array.isArray(old['data'])) {
    const data = updater(old['data'] as TenantMember[]);
    return {
      ...old,
      data
    } as MembersQueryData;
  }

  return old;
}

function extractMembers(data: MembersQueryData | undefined): TenantMember[] | undefined {
  if (Array.isArray(data)) {
    return data;
  }

  if (isObject(data) && Array.isArray(data['data'])) {
    return data['data'] as TenantMember[];
  }

  return undefined;
}

function updateAllMembersQueryCaches(
  queryClient: QueryClient,
  updater: (members: TenantMember[]) => TenantMember[],
  tenantId?: string
): OptimisticContext {
  const legacyQueryKey = getMembersQueryKey(tenantId);
  const previousMembers = queryClient.getQueryData<TenantMember[]>(legacyQueryKey);

  const previousSnapshotsRaw =
    queryClient.getQueriesData?.({
      predicate: (query) => hasMembersGetMembersPath(query.queryKey)
    }) ?? [];

  const previousSnapshots = previousSnapshotsRaw.map(([queryKey, data]) => ({
    queryKey,
    data: data as MembersQueryData | undefined
  }));

  queryClient.setQueryData<TenantMember[]>(legacyQueryKey, (old) => updater(old ?? []));

  queryClient.setQueriesData?.(
    { predicate: (query) => hasMembersGetMembersPath(query.queryKey) },
    (old: unknown) => applyMembersUpdater(old as MembersQueryData | undefined, updater)
  );

  const fallbackPreviousMembers = previousMembers ?? extractMembers(previousSnapshots[0]?.data);

  return {
    previousMembers: fallbackPreviousMembers,
    previousSnapshots
  };
}

// ============================================================================
// OPTIMISTIC UPDATE HANDLERS
// ============================================================================

/**
 * Handle optimistic role update
 *
 * Updates member role immediately in UI, rolls back on error
 *
 * @param queryClient - React Query client instance
 * @param memberId - ID of member to update
 * @param newRole - New role to assign
 * @param tenantId - Optional tenant ID for multi-tenancy scoping
 * @returns Context for rollback (previous members list)
 */
export function handleOptimisticRoleUpdate(
  queryClient: QueryClient,
  memberId: string,
  newRole: TenantRole,
  tenantId?: string
): OptimisticContext {
  return updateAllMembersQueryCaches(
    queryClient,
    (members) =>
      members.map((member) => (member.id === memberId ? { ...member, role: newRole } : member)),
    tenantId
  );
}

/**
 * Handle optimistic status update
 *
 * Updates member status immediately in UI, rolls back on error
 *
 * @param queryClient - React Query client instance
 * @param memberId - ID of member to update
 * @param newStatus - New status to assign
 * @param tenantId - Optional tenant ID for multi-tenancy scoping
 * @returns Context for rollback (previous members list)
 */
export function handleOptimisticStatusUpdate(
  queryClient: QueryClient,
  memberId: string,
  newStatus: MemberStatus,
  tenantId?: string
): OptimisticContext {
  return updateAllMembersQueryCaches(
    queryClient,
    (members) =>
      members.map((member) => (member.id === memberId ? { ...member, status: newStatus } : member)),
    tenantId
  );
}

/**
 * Handle optimistic member deletion
 *
 * Removes member from list immediately, rolls back on error
 *
 * @param queryClient - React Query client instance
 * @param memberId - ID of member to delete
 * @param tenantId - Optional tenant ID for multi-tenancy scoping
 * @returns Context for rollback (previous members list)
 */
export function handleOptimisticDelete(
  queryClient: QueryClient,
  memberId: string,
  tenantId?: string
): OptimisticContext {
  return updateAllMembersQueryCaches(
    queryClient,
    (members) => members.filter((member) => member.id !== memberId),
    tenantId
  );
}

/**
 * Handle mutation error with rollback
 *
 * Rolls back optimistic update and shows error toast
 *
 * @param queryClient - React Query client instance
 * @param context - Context from onMutate (contains previous state)
 * @param error - Error from mutation
 * @param operation - Operation name for error message
 * @param tenantId - Optional tenant ID for multi-tenancy scoping
 */
export function handleMutationError(
  queryClient: QueryClient,
  context: OptimisticContext | undefined,
  error: TRPCClientErrorLike<AppRouter>,
  operation: string,
  tenantId?: string
): void {
  if (context?.previousSnapshots?.length) {
    context.previousSnapshots.forEach((snapshot) => {
      queryClient.setQueryData(snapshot.queryKey, () => snapshot.data);
    });
  }

  // Rollback to previous state
  if (context?.previousMembers) {
    const queryKey = getMembersQueryKey(tenantId);
    queryClient.setQueryData(queryKey, () => context.previousMembers);
  }

  // Show error toast
  const errorMessage = error.message || `Failed to ${operation}`;
  toast.error(`Error: ${errorMessage}`, ERROR_TOAST_CONFIG);
}

/**
 * Handle mutation success
 *
 * Shows success toast and invalidates queries for refetch
 *
 * @param queryClient - React Query client instance
 * @param operation - Operation name for success message
 * @param tenantId - Optional tenant ID for multi-tenancy scoping
 * @returns Promise that resolves when queries are invalidated
 */
export async function handleMutationSuccess(
  queryClient: QueryClient,
  operation: string,
  tenantId?: string
): Promise<void> {
  // Show success toast
  toast.success(`Successfully ${operation}`, SUCCESS_TOAST_CONFIG);

  // Invalidate members query to refetch from server
  await queryClient.invalidateQueries({ queryKey: getMembersQueryKey(tenantId) });
  await queryClient.invalidateQueries({
    predicate: (query) => hasMembersGetMembersPath(query.queryKey)
  });
}

// ============================================================================
// EXPORTS (for unit testing)
// ============================================================================

export {
  MEMBERS_QUERY_KEY,
  getMembersQueryKey,
  TOAST_DURATION_MS,
  SUCCESS_TOAST_CONFIG,
  ERROR_TOAST_CONFIG
};

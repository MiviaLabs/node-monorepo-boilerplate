'use client';

/**
 * Members Page Content Component
 *
 * Client component that handles interactive features for the members page
 * (filtering, pagination, refresh, invitations)
 */

import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, RefreshCw, Users, UserCheck, Shield } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useOptimistic, useRef, useTransition } from 'react';

import {
  applyMembersOptimisticAction,
  createMembersOptimisticState,
  snapshotMember
} from './member-list-optimistic-state';
import { InviteMemberDialog } from '../tenant/invite-member-dialog';
import { MembersTable } from '../tenant/members-table';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import { WorkspaceStat, WorkspaceStatSize } from '../ui/workspace-stat';

import type { User } from '~/types/auth.types';
import type {
  MemberFilters,
  MembersResponse,
  TenantRole,
  TenantMember
} from '~/types/tenant.types';

import {
  DEFAULT_MEMBERS_PAGE,
  DEFAULT_MEMBERS_PAGE_SIZE,
  toMembersQuerySearchParams,
  type MembersQueryState
} from '~/lib/members/members-query-params';
import { alertVariants, standardTransition } from '~/lib/motion';
import { MemberStatus, SortByField, SortOrder, TENANT_ROLES } from '~/types/tenant.types';

// ============================================================================
// TYPES
// ============================================================================

interface MembersPageContentProps {
  initialData: TenantMember[];
  initialMeta?: MembersResponse['meta'];
  initialQueryInput: MembersQueryState;
  user: User;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Members Page Content Component
 *
 * Handles interactive features while starting with server-fetched data.
 * No loading state on initial render - data is already available.
 */
// eslint-disable-next-line complexity
export function MembersPageContent({
  initialData,
  initialMeta,
  initialQueryInput,
  user
}: MembersPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeInitialData = Array.isArray(initialData) ? initialData : [];

  const inferTotal = (total: number | undefined, dataLength: number): number =>
    typeof total === 'number' && total > 0 ? total : dataLength;

  const normalizedInitialMeta = {
    page: initialMeta?.page ?? initialQueryInput.page ?? DEFAULT_MEMBERS_PAGE,
    pageSize: initialMeta?.pageSize ?? initialQueryInput.pageSize ?? DEFAULT_MEMBERS_PAGE_SIZE,
    total: inferTotal(initialMeta?.total, safeInitialData.length)
  };
  const serverState = createMembersOptimisticState(safeInitialData, normalizedInitialMeta.total);
  const [optimisticState, applyOptimistic] = useOptimistic(
    serverState,
    applyMembersOptimisticAction
  );
  const queryInput = initialQueryInput;

  const replaceQueryInput = useCallback(
    (nextQuery: MembersQueryState) => {
      const nextParams = toMembersQuerySearchParams(nextQuery, {
        page: DEFAULT_MEMBERS_PAGE,
        pageSize: DEFAULT_MEMBERS_PAGE_SIZE
      });
      const next = nextParams.toString();
      const current = toMembersQuerySearchParams(queryInput, {
        page: DEFAULT_MEMBERS_PAGE,
        pageSize: DEFAULT_MEMBERS_PAGE_SIZE
      }).toString();

      if (next !== current) {
        const href = next ? `${pathname}?${next}` : pathname;
        startTransition(() => {
          router.replace(href, { scroll: false });
        });
      }
    },
    [pathname, queryInput, router, startTransition]
  );

  useEffect(() => {
    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
    };
  }, []);
  const members = optimisticState.members;
  const isLoading = isPending;
  const error = null;

  const refreshMembers = useCallback(async () => {
    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition]);

  const applyOptimisticRoleUpdate = useCallback(
    (memberId: string, role: TenantRole) => {
      const snapshot = snapshotMember(optimisticState, memberId);
      applyOptimistic({ type: 'updateRole', memberId, role });
      return snapshot;
    },
    [applyOptimistic, optimisticState]
  );

  const applyOptimisticStatusUpdate = useCallback(
    (memberId: string, status: MemberStatus) => {
      const snapshot = snapshotMember(optimisticState, memberId);
      applyOptimistic({ type: 'updateStatus', memberId, status });
      return snapshot;
    },
    [applyOptimistic, optimisticState]
  );

  const applyOptimisticDelete = useCallback(
    (memberId: string) => {
      const snapshot = snapshotMember(optimisticState, memberId);
      applyOptimistic({ type: 'removeMember', memberId });
      return snapshot;
    },
    [applyOptimistic, optimisticState]
  );

  const rollbackOptimisticMember = useCallback(
    (snapshot: ReturnType<typeof snapshotMember>) => {
      if (!snapshot) {
        return;
      }

      applyOptimistic({ type: 'restoreMember', snapshot });
    },
    [applyOptimistic]
  );

  const updateFilters = useCallback(
    (newFilters: MemberFilters) => {
      replaceQueryInput({
        ...queryInput,
        page: DEFAULT_MEMBERS_PAGE,
        search: newFilters.search,
        role: newFilters.role,
        status: newFilters.status
      });
    },
    [queryInput, replaceQueryInput]
  );

  const updateSorting = useCallback(
    (field: SortByField) => {
      const nextOrder =
        queryInput.sortBy === field
          ? queryInput.sortOrder === SortOrder.ASC
            ? SortOrder.DESC
            : SortOrder.ASC
          : SortOrder.ASC;

      replaceQueryInput({
        ...queryInput,
        page: DEFAULT_MEMBERS_PAGE,
        sortBy: field,
        sortOrder: nextOrder
      });
    },
    [queryInput, replaceQueryInput]
  );

  // Check if user has permission to manage members
  const canManageMembers = Boolean(
    user?.permissions?.includes('tenant:users:create') ||
    user?.permissions?.includes('tenant:users:update') ||
    user?.permissions?.includes('tenant:users:delete') ||
    user?.roles?.includes(TENANT_ROLES.OWNER) ||
    user?.roles?.includes(TENANT_ROLES.ADMIN)
  );
  const totalMembers = optimisticState.total;
  const activeMembers = members.filter(
    (m) =>
      m.status === MemberStatus.ACTIVE ||
      (typeof m.status === 'string' && m.status.toUpperCase() === 'ACTIVE')
  ).length;
  const adminOrOwnerMembers = members.filter(
    (m) => m.role === TENANT_ROLES.OWNER || m.role === TENANT_ROLES.ADMIN
  ).length;
  const currentPage = normalizedInitialMeta.page;
  const currentPageSize = normalizedInitialMeta.pageSize;

  useEffect(() => {
    if (totalMembers > 0 && members.length === 0 && currentPage > 1) {
      replaceQueryInput({
        ...queryInput,
        page: DEFAULT_MEMBERS_PAGE
      });
    }
  }, [currentPage, members.length, queryInput, replaceQueryInput, totalMembers]);

  return (
    <div className="w-full space-y-5">
      {/* Error Display */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error-alert"
            variants={alertVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={standardTransition}
          >
            <Alert
              variant="destructive"
              className="mb-6 border-red-300/70 bg-red-50 dark:border-red-900/60 dark:bg-red-950/25"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Permission Warning */}
      <AnimatePresence mode="wait">
        {!canManageMembers && (
          <motion.div
            key="permission-warning"
            variants={alertVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={standardTransition}
          >
            <Alert className="mb-6 border-border bg-card/85">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Restricted Permissions</AlertTitle>
              <AlertDescription>
                Your current role lacks permissions to modify team members. Reach out to your
                workspace owner to adjust settings.
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Members Table */}
      <MembersTable
        data={members}
        isLoading={isLoading}
        summary={
          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            <WorkspaceStat
              label="Total"
              value={totalMembers}
              icon={Users}
              iconClassName="bg-blue-500/10 text-blue-600 ring-blue-500/20 group-hover:bg-blue-500/15 dark:text-blue-400"
              size={WorkspaceStatSize.COMPACT}
            />
            <WorkspaceStat
              label="Active"
              value={activeMembers}
              icon={UserCheck}
              iconClassName="bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 group-hover:bg-emerald-500/15 dark:text-emerald-400"
              size={WorkspaceStatSize.COMPACT}
            />
            <WorkspaceStat
              label="Admins"
              value={adminOrOwnerMembers}
              icon={Shield}
              iconClassName="bg-amber-500/10 text-amber-600 ring-amber-500/20 group-hover:bg-amber-500/15 dark:text-amber-400"
              size={WorkspaceStatSize.COMPACT}
            />
          </div>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refreshMembers()}
              disabled={isLoading}
              className="h-9 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 hover:bg-accent/80 hover:text-foreground"
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {canManageMembers ? <InviteMemberDialog onInviteSuccess={refreshMembers} /> : null}
          </>
        }
        canManageMembers={canManageMembers}
        onRefresh={refreshMembers}
        optimisticActions={{
          onDeleteOptimistic: applyOptimisticDelete,
          onRoleOptimisticUpdate: applyOptimisticRoleUpdate,
          onRollback: rollbackOptimisticMember,
          onStatusOptimisticUpdate: applyOptimisticStatusUpdate
        }}
        filters={{
          search: queryInput.search,
          role: queryInput.role,
          status: queryInput.status
        }}
        onSearchChange={(search) => {
          if (searchDebounceTimerRef.current) {
            clearTimeout(searchDebounceTimerRef.current);
          }

          searchDebounceTimerRef.current = setTimeout(() => {
            updateFilters({
              search: search.trim() || undefined,
              role: queryInput.role,
              status: queryInput.status
            });
          }, 300);
        }}
        onRoleChange={(role) =>
          updateFilters({
            search: queryInput.search,
            role: role === 'all' ? undefined : (role as TenantRole),
            status: queryInput.status
          })
        }
        onStatusChange={(status) =>
          updateFilters({
            search: queryInput.search,
            role: queryInput.role,
            status: status === 'all' ? undefined : (status as MemberStatus)
          })
        }
        sortBy={queryInput.sortBy}
        sortOrder={queryInput.sortOrder}
        onSortChange={updateSorting}
        pagination={{
          page: currentPage,
          pageSize: currentPageSize,
          total: totalMembers
        }}
        onPageChange={(page) =>
          replaceQueryInput({
            ...queryInput,
            page
          })
        }
      />
    </div>
  );
}

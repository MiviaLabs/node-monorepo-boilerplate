'use client';

/**
 * Members Table Component
 *
 * Data table for displaying and managing tenant members
 */

import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter, Shield, User } from 'lucide-react';
import { useMemo } from 'react';

import { MembersTableToolbar } from './members-table-toolbar';

import type { MembersTableOptimisticActions } from './members-table-actions';
import type { ReactNode } from 'react';
import type { MemberFilters, TenantMember } from '~/types/tenant.types';

import { MemberActionsCell } from '~/components/tenant/members-table-actions';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { InventoryListPagination, InventoryListShell } from '~/components/ui/inventory-list';
import { tableRowVariants, STAGGER } from '~/lib/motion';
import {
  MemberStatus,
  ROLE_DISPLAY,
  SortByField,
  SortOrder,
  STATUS_DISPLAY,
  TENANT_ROLES
} from '~/types/tenant.types';

interface MembersTableProps {
  data: TenantMember[];
  isLoading?: boolean;
  summary?: ReactNode;
  actions?: ReactNode;
  canManageMembers?: boolean;
  onRefresh?: () => Promise<void> | void;
  optimisticActions?: MembersTableOptimisticActions;
  filters: MemberFilters;
  pagination?: { page: number; pageSize: number; total: number };
  onPageChange?: (page: number) => void;
  sortBy?: SortByField;
  sortOrder?: SortOrder;
  onSortChange?: (field: SortByField) => void;
  onSearchChange: (search: string) => void;
  onRoleChange: (role: string) => void;
  onStatusChange: (status: string) => void;
}

function renderSortIcon(
  activeField: SortByField | undefined,
  field: SortByField,
  sortOrder: SortOrder | undefined
) {
  if (activeField !== field) {
    return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />;
  }

  return sortOrder === SortOrder.ASC ? (
    <ArrowUp className="ml-2 h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="ml-2 h-3.5 w-3.5" />
  );
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSortChange
}: {
  label: string;
  field: SortByField;
  sortBy?: SortByField;
  sortOrder?: SortOrder;
  onSortChange?: (field: SortByField) => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={() => onSortChange?.(field)}
      className="h-7 px-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:bg-transparent hover:text-foreground"
    >
      {label}
      {renderSortIcon(sortBy, field, sortOrder)}
    </Button>
  );
}

function getMemberIdentity(member: TenantMember) {
  const memberDisplayNameRaw = member.displayName?.trim();
  const memberDisplayName =
    memberDisplayNameRaw && memberDisplayNameRaw.length > 0 ? memberDisplayNameRaw : member.email;
  const displayNameForCell =
    memberDisplayNameRaw && memberDisplayNameRaw.length > 0
      ? memberDisplayNameRaw
      : (member.email.split('@')[0] ?? member.email);
  const memberLocalPart = memberDisplayName.split('@')[0] ?? memberDisplayName;
  const initials = memberLocalPart
    .split(' ')
    .filter(Boolean)
    .map((value) => value[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return {
    displayName: displayNameForCell,
    fullDisplayName: memberDisplayName,
    initials
  };
}

function MemberRoleBadge({ member }: { member: TenantMember }) {
  const isStaff = member.role === TENANT_ROLES.OWNER || member.role === TENANT_ROLES.ADMIN;

  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1.5 border-border/40 bg-card/50 px-2 py-0.5 text-[11px] font-bold tracking-wide transition-[background-color] duration-150 hover:bg-card ${
        isStaff ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
      }`}
    >
      {isStaff ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
      {ROLE_DISPLAY[member.role].label}
    </Badge>
  );
}

function MemberStatusBadge({ member }: { member: TenantMember }) {
  const display = STATUS_DISPLAY[member.status];

  return (
    <Badge
      variant="outline"
      className={`border-border/40 bg-card/50 px-2 py-0.5 text-[11px] font-bold tracking-wide transition-[background-color] duration-150 hover:bg-card ${
        member.status === MemberStatus.ACTIVE
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-muted-foreground'
      }`}
    >
      <span
        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
          member.status === MemberStatus.ACTIVE ? 'bg-emerald-500' : 'bg-muted-foreground/40'
        }`}
      />
      {display.label}
    </Badge>
  );
}

export function MembersTable({
  data,
  isLoading,
  summary,
  actions,
  canManageMembers = false,
  onRefresh,
  optimisticActions,
  filters,
  pagination,
  onPageChange,
  sortBy,
  sortOrder,
  onSortChange,
  onSearchChange,
  onRoleChange,
  onStatusChange
}: MembersTableProps) {
  const paginationState = useMemo(
    () =>
      pagination ?? {
        page: 1,
        pageSize: data.length > 0 ? data.length : 10,
        total: data.length
      },
    [pagination, data.length]
  );

  const totalPages = Math.max(1, Math.ceil(paginationState.total / paginationState.pageSize));
  const showingFrom =
    paginationState.total === 0 ? 0 : (paginationState.page - 1) * paginationState.pageSize + 1;
  const showingTo =
    paginationState.total === 0
      ? 0
      : Math.min(
          (paginationState.page - 1) * paginationState.pageSize + data.length,
          paginationState.total
        );
  const canGoPrevious = paginationState.page > 1 && !isLoading;
  const canGoNext = paginationState.page < totalPages && !isLoading;
  const desktopGridClassName = canManageMembers
    ? 'grid-cols-[minmax(0,1.8fr)_110px_110px_110px_56px]'
    : 'grid-cols-[minmax(0,1.8fr)_110px_110px_110px]';
  const headerCells = [
    {
      key: 'member',
      content: (
        <SortableHeader
          label="Member"
          field={SortByField.DISPLAY_NAME}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
        />
      )
    },
    {
      key: 'role',
      content: (
        <SortableHeader
          label="Role"
          field={SortByField.ROLE}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
        />
      )
    },
    {
      key: 'status',
      content: (
        <SortableHeader
          label="Status"
          field={SortByField.STATUS}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
        />
      )
    },
    {
      key: 'joined',
      content: (
        <SortableHeader
          label="Joined"
          field={SortByField.JOINED_AT}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
        />
      )
    },
    ...(canManageMembers
      ? [
          {
            key: 'actions',
            content: <span>Actions</span>,
            className: 'text-right'
          }
        ]
      : [])
  ];

  return (
    <InventoryListShell
      total={paginationState.total}
      summary={summary}
      toolbar={
        <MembersTableToolbar
          globalFilter={filters.search ?? ''}
          roleFilter={filters.role ?? 'all'}
          statusFilter={filters.status ?? 'all'}
          onSearchChange={onSearchChange}
          onRoleChange={onRoleChange}
          onStatusChange={onStatusChange}
        />
      }
      headerActions={
        <>
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/15 px-3 py-1.5 text-xs text-muted-foreground">
            <ListFilter className="h-3.5 w-3.5" />
            {showingFrom}-{showingTo} of {paginationState.total}
          </div>
          {actions}
        </>
      }
      headerCells={headerCells}
      desktopGridClassName={desktopGridClassName}
      hasRows={data.length > 0}
      emptyState={
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Syncing directory...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <p className="font-semibold text-foreground/80">No matching members</p>
              <p className="text-xs">
                Refine your keyword search or role filters to find workspace collaborators.
              </p>
            </div>
          )}
        </div>
      }
      footer={
        <InventoryListPagination
          page={paginationState.page}
          totalPages={totalPages}
          showingFrom={showingFrom}
          showingTo={showingTo}
          total={paginationState.total}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={() => onPageChange?.(Math.max(1, paginationState.page - 1))}
          onNext={() => onPageChange?.(Math.min(totalPages, paginationState.page + 1))}
        />
      }
    >
      <AnimatePresence mode="popLayout">
        {data.map((member, index) => {
          const identity = getMemberIdentity(member);
          const avatarUrl = member.photoUrl ?? null;

          return (
            <motion.div
              key={member.id}
              variants={tableRowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{
                duration: 0.25,
                delay: index * STAGGER.TIGHT,
                ease: [0.32, 0.72, 0, 1]
              }}
              className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20 md:grid md:items-center ${desktopGridClassName}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3 py-1">
                  <div className="relative">
                    <Avatar className="h-9 w-9 border border-border/40 shadow-xs ring-offset-background transition-opacity hover:opacity-90">
                      <AvatarImage src={avatarUrl ?? undefined} alt={identity.fullDisplayName} />
                      <AvatarFallback className="bg-linear-to-br from-secondary/50 to-secondary text-[11px] font-bold">
                        {identity.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                        member.status === MemberStatus.ACTIVE
                          ? 'bg-emerald-500'
                          : 'bg-muted-foreground/40'
                      }`}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {identity.displayName}
                    </span>
                    <span className="truncate text-[11px] font-medium text-muted-foreground/70">
                      {member.email}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground md:hidden">
                      <span>{ROLE_DISPLAY[member.role].label}</span>
                      <span>•</span>
                      <span>{STATUS_DISPLAY[member.status].label}</span>
                      <span>•</span>
                      <span>{format(new Date(member.joinedAt), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden min-w-0 md:block">
                <MemberRoleBadge member={member} />
              </div>

              <div className="hidden min-w-0 md:block">
                <MemberStatusBadge member={member} />
              </div>

              <div className="hidden min-w-0 md:block text-[12px] font-medium text-muted-foreground/80">
                {format(new Date(member.joinedAt), 'MMM dd, yyyy')}
              </div>

              <div className="min-w-0 md:text-right">
                {canManageMembers ? (
                  <div className="flex justify-start md:justify-end">
                    <MemberActionsCell
                      member={member}
                      onRefresh={onRefresh}
                      optimisticActions={optimisticActions}
                    />
                  </div>
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </InventoryListShell>
  );
}

import { ShieldCheck, UserRoundCog } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import {
  accessActionClassName,
  accessInputClassName,
  accessSelectClassName,
  AccessFilterShell,
  AccessMetricsSummaryCard,
  AccessPaginationSummary,
  formatRoleLabel,
  formatSystemRoles,
  formatTimestamp,
  getParam,
  getRoleTone,
  parsePositiveInt,
  SearchParamsRecord
} from '../memberships/_access-shared';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { UserDeleteMenuItem } from '~/components/admin/inventory-danger-actions';
import {
  InventoryRowActionLink,
  InventoryRowActions,
  InventoryRowActionsLabel,
  InventoryRowActionsSeparator
} from '~/components/admin/inventory-row-actions';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent } from '~/components/ui/card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '~/components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '~/components/ui/table';
import { getAdminUsersOverview } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';
import { cn } from '~/lib/utils';

const USERS_ROUTE = '/users';

function buildUsersHref(
  current: Record<string, string | number | undefined>,
  overrides: Record<string, string | number | undefined>
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value === undefined || value === '' || value === 'all') {
      continue;
    }

    if (
      (key === 'page' && value === 1) ||
      (key === 'pageSize' && value === 20) ||
      (key === 'recordState' && value === 'active')
    ) {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query.length > 0 ? `${USERS_ROUTE}?${query}` : USERS_ROUTE;
}

function buildUserDetailHref(userId: number) {
  return `/users/${userId}`;
}

function buildMembershipDetailHref(userId: number, tenantId: number) {
  return `/memberships/${userId}?tenantId=${tenantId}`;
}

export default async function UsersPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const query = {
    page: parsePositiveInt(getParam(resolvedParams, 'page'), 1),
    pageSize: parsePositiveInt(getParam(resolvedParams, 'pageSize'), 20),
    search: getParam(resolvedParams, 'search') ?? '',
    userTenantId: parsePositiveInt(getParam(resolvedParams, 'userTenantId'), 0),
    userScopeLabel: getParam(resolvedParams, 'userScopeLabel') ?? '',
    recordState: getParam(resolvedParams, 'recordState') ?? 'active',
    identityState: getParam(resolvedParams, 'identityState') ?? 'all',
    privilege: getParam(resolvedParams, 'privilege') ?? 'all',
    systemRole: getParam(resolvedParams, 'systemRole') ?? 'all',
    sortBy: getParam(resolvedParams, 'sortBy') ?? 'displayName',
    sortOrder: getParam(resolvedParams, 'sortOrder') ?? 'asc'
  };

  const overview = await getAdminUsersOverview({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search || undefined,
    userTenantId: query.userTenantId || undefined,
    recordState: query.recordState !== 'active' ? query.recordState : undefined,
    identityState: query.identityState !== 'all' ? query.identityState : undefined,
    privilege: query.privilege !== 'all' ? query.privilege : undefined,
    systemRole: query.systemRole !== 'all' ? query.systemRole : undefined,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder
  });
  const session = await getAdminSession();
  const currentOperatorUserId = Number(session?.user.userId ?? NaN);

  const hasScope = query.userTenantId > 0;
  const activeFilters = [
    hasScope ? `Scope: ${query.userScopeLabel || `tenant ${query.userTenantId}`}` : null,
    query.recordState !== 'active' ? query.recordState.replace('_', ' ') : null,
    query.identityState !== 'all' ? `Identity: ${query.identityState.replace('_', ' ')}` : null,
    query.privilege !== 'all' ? `Privilege: ${query.privilege}` : null,
    query.systemRole !== 'all' ? `Role: ${formatRoleLabel(query.systemRole)}` : null,
    query.search ? `Search: ${query.search}` : null
  ].filter(Boolean) as string[];

  const resetHref = buildUsersHref(
    {
      userTenantId: query.userTenantId || undefined,
      userScopeLabel: query.userScopeLabel || undefined,
      page: query.page,
      pageSize: query.pageSize,
      recordState: query.recordState,
      identityState: query.identityState,
      privilege: query.privilege,
      systemRole: query.systemRole,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder
    },
    {
      userTenantId: query.userTenantId || undefined,
      userScopeLabel: query.userScopeLabel || undefined,
      page: 1,
      pageSize: 20,
      recordState: undefined,
      identityState: undefined,
      privilege: undefined,
      systemRole: undefined,
      search: undefined,
      sortBy: 'displayName',
      sortOrder: 'asc'
    }
  );

  return (
    <AppPage className="space-y-7">
      <PageHeader
        title="Users"
        badge="Identity"
        description="Review global user accounts, identity posture, and organization footprint."
        actions={
          <Link href="/memberships" className={accessActionClassName}>
            View memberships
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        <Card className="premium-panel rounded-xl border-border/70 xl:order-1">
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-col gap-3 border-b border-border/70 pb-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    Users
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Global identity inventory with organization footprint and system posture.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{overview.pagination.total} user records</span>
                  <span className="text-border">•</span>
                  <span>Generated {formatTimestamp(overview.generatedAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeFilters.map((filter) => (
                  <Badge
                    key={filter}
                    variant="outline"
                    size="sm"
                    className="border-border/70 bg-background/70 text-muted-foreground"
                  >
                    {filter}
                  </Badge>
                ))}
                {activeFilters.length > 0 ? (
                  <Link
                    href={resetHref}
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Reset users
                  </Link>
                ) : null}
              </div>
            </div>

            {overview.users.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">No users</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust the current user filters to broaden the inventory.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background/80">
                  <Table density="compact">
                    <TableHeader>
                      <TableRow className="bg-[hsl(var(--panel-subtle))]">
                        <TableHead className="px-4">User</TableHead>
                        <TableHead className="px-4">Organization</TableHead>
                        <TableHead className="px-4">Identity</TableHead>
                        <TableHead className="px-4">Access</TableHead>
                        <TableHead className="px-4">Last sign-in</TableHead>
                        <TableHead className="px-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.users.map((user) => {
                        const isCurrentOperator = currentOperatorUserId === user.userId;
                        const deleteDisabledLabel = isCurrentOperator
                          ? 'Current user'
                          : 'Deleted user';

                        return (
                          <TableRow key={user.userId}>
                            <TableCell className="align-top px-4">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  {user.isPrivileged ? (
                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                                      <ShieldCheck className="h-4 w-4" />
                                    </span>
                                  ) : (
                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] text-muted-foreground">
                                      <UserRoundCog className="h-4 w-4" />
                                    </span>
                                  )}
                                  <div className="space-y-0.5">
                                    <Link
                                      href={buildUserDetailHref(user.userId)}
                                      className="font-medium text-foreground underline-offset-4 hover:underline"
                                    >
                                      {user.displayName ?? `User ${user.userId}`}
                                    </Link>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {user.userLifecycle === 'deleted' ? (
                                    <Badge
                                      variant="outline"
                                      size="sm"
                                      className="border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300"
                                    >
                                      Deleted
                                    </Badge>
                                  ) : null}
                                  {!user.userActive ? (
                                    <Badge variant="outline" size="sm">
                                      Inactive
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="align-top px-4">
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">
                                  {user.organizationDisplayName ??
                                    user.organizationName ??
                                    'No primary organization'}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {user.membershipCount} memberships
                                  {user.defaultTenantId
                                    ? ` • Default tenant ${user.defaultTenantId}`
                                    : ''}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="align-top px-4">
                              <div className="space-y-1.5">
                                <Badge variant="outline" size="sm">
                                  {user.primaryIdentityProvider ?? 'No primary identity'}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  size="sm"
                                  className={cn(
                                    user.hasPrimaryIdentity
                                      ? 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                                      : 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300'
                                  )}
                                >
                                  {user.hasPrimaryIdentity
                                    ? 'Primary identity'
                                    : 'Identity missing'}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="align-top px-4">
                              <div className="space-y-1.5">
                                <Badge variant="outline" size="sm">
                                  {formatSystemRoles(user.systemRoles)}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  size="sm"
                                  className={cn(
                                    user.isPrivileged
                                      ? 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300'
                                      : getRoleTone('tenant_user')
                                  )}
                                >
                                  {user.isPrivileged ? 'Privileged' : 'Standard'}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="align-top px-4 text-[11px] text-muted-foreground">
                              {user.lastSignInAt ? formatTimestamp(user.lastSignInAt) : 'Unknown'}
                            </TableCell>
                            <TableCell className="align-top px-4">
                              <InventoryRowActions
                                label={`Actions for ${user.displayName ?? `user ${user.userId}`}`}
                              >
                                <InventoryRowActionsLabel>User</InventoryRowActionsLabel>
                                <InventoryRowActionLink href={buildUserDetailHref(user.userId)}>
                                  View user
                                </InventoryRowActionLink>
                                {user.defaultTenantId ? (
                                  <InventoryRowActionLink
                                    href={buildMembershipDetailHref(
                                      user.userId,
                                      user.defaultTenantId
                                    )}
                                  >
                                    View default membership
                                  </InventoryRowActionLink>
                                ) : null}
                                <InventoryRowActionsSeparator />
                                {user.organizationId ? (
                                  <UserDeleteMenuItem
                                    userId={user.userId}
                                    organizationId={user.organizationId}
                                    displayName={user.displayName ?? `User ${user.userId}`}
                                    disabled={isCurrentOperator || user.userLifecycle === 'deleted'}
                                    disabledLabel={deleteDisabledLabel}
                                  />
                                ) : null}
                              </InventoryRowActions>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <Pagination className="justify-between">
                  <PaginationContent>
                    <PaginationItem>
                      {overview.pagination.hasPrevious ? (
                        <PaginationPrevious
                          href={buildUsersHref(query, { page: overview.pagination.page - 1 })}
                        />
                      ) : (
                        <PaginationLink
                          aria-disabled="true"
                          className="pointer-events-none opacity-50"
                        >
                          Previous
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  </PaginationContent>
                  <AccessPaginationSummary
                    page={overview.pagination.page}
                    totalPages={overview.pagination.totalPages}
                  />
                  <PaginationContent>
                    <PaginationItem>
                      {overview.pagination.hasNext ? (
                        <PaginationNext
                          href={buildUsersHref(query, { page: overview.pagination.page + 1 })}
                        />
                      ) : (
                        <PaginationLink
                          aria-disabled="true"
                          className="pointer-events-none opacity-50"
                        >
                          Next
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3 xl:order-2">
          <AccessMetricsSummaryCard title="User summary" metrics={overview.metrics} />

          <AccessFilterShell
            title="Filters"
            description="Refine the user list by lifecycle, identity posture, privilege, and system role."
          >
            <form action={USERS_ROUTE} method="get" className="space-y-3">
              <input
                type="text"
                name="search"
                defaultValue={query.search}
                placeholder="Search user, provider, or organization"
                className={accessInputClassName}
              />
              <input type="hidden" name="userTenantId" value={query.userTenantId || ''} />
              <input type="hidden" name="userScopeLabel" value={query.userScopeLabel} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <select
                  name="recordState"
                  defaultValue={query.recordState}
                  className={accessSelectClassName}
                >
                  <option value="active">Active records</option>
                  <option value="deleted">Deleted records</option>
                  <option value="all">All records</option>
                </select>
                <select
                  name="identityState"
                  defaultValue={query.identityState}
                  className={accessSelectClassName}
                >
                  <option value="all">All identity states</option>
                  <option value="with_identity">With identity</option>
                  <option value="without_identity">Without identity</option>
                </select>
                <select
                  name="privilege"
                  defaultValue={query.privilege}
                  className={accessSelectClassName}
                >
                  <option value="all">All privilege</option>
                  <option value="privileged">Privileged</option>
                  <option value="standard">Standard</option>
                </select>
                <select
                  name="systemRole"
                  defaultValue={query.systemRole}
                  className={accessSelectClassName}
                >
                  <option value="all">All system roles</option>
                  <option value="system_owner">System owner</option>
                  <option value="system_admin">System admin</option>
                </select>
                <select name="sortBy" defaultValue={query.sortBy} className={accessSelectClassName}>
                  <option value="displayName">Sort: Name</option>
                  <option value="membershipCount">Sort: Memberships</option>
                  <option value="lastSignInAt">Sort: Last sign-in</option>
                  <option value="createdAt">Sort: Created</option>
                </select>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <select
                    name="sortOrder"
                    defaultValue={query.sortOrder}
                    className={accessSelectClassName}
                  >
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
                  <select
                    name="pageSize"
                    defaultValue={String(query.pageSize)}
                    className={accessSelectClassName}
                  >
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                </div>
              </div>
              <input type="hidden" name="page" value="1" />
              <button type="submit" className={accessActionClassName}>
                Apply user filters
              </button>
            </form>
          </AccessFilterShell>
        </div>
      </div>
    </AppPage>
  );
}

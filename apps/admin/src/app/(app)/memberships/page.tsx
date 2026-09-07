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
  AccessRoute,
  buildAccessHref,
  formatRoleLabel,
  formatSystemRoles,
  formatTimestamp,
  getDisplayName,
  getMembershipStatusPresentation,
  getParam,
  getRoleTone,
  parsePositiveInt,
  SearchParamsRecord
} from './_access-shared';

import type { AdminAccessMembershipStatus } from '~/lib/admin';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import {
  MembershipRemoveMenuItem,
  UserDeleteMenuItem
} from '~/components/admin/inventory-danger-actions';
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
import { getAdminAccessOverview } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';
import { cn } from '~/lib/utils';

function buildMemberDetailHref(userId: number, tenantId: number) {
  return `/memberships/${userId}?tenantId=${tenantId}`;
}

function buildUserDetailHref(userId: number) {
  return `/users/${userId}`;
}

// eslint-disable-next-line complexity
export default async function AccessPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const query = {
    memberPage: parsePositiveInt(getParam(resolvedParams, 'memberPage'), 1),
    memberPageSize: parsePositiveInt(getParam(resolvedParams, 'memberPageSize'), 20),
    memberRecordState: getParam(resolvedParams, 'memberRecordState') ?? 'active',
    memberSearch: getParam(resolvedParams, 'memberSearch') ?? '',
    memberOrganizationId: parsePositiveInt(getParam(resolvedParams, 'memberOrganizationId'), 0),
    memberTenantId: parsePositiveInt(getParam(resolvedParams, 'memberTenantId'), 0),
    memberScopeLabel: getParam(resolvedParams, 'memberScopeLabel') ?? '',
    memberStatus: getParam(resolvedParams, 'memberStatus') ?? 'all',
    memberPrivilege: getParam(resolvedParams, 'memberPrivilege') ?? 'all',
    memberRole: getParam(resolvedParams, 'memberRole') ?? 'all',
    memberSortBy: getParam(resolvedParams, 'memberSortBy') ?? 'displayName',
    memberSortOrder: getParam(resolvedParams, 'memberSortOrder') ?? 'asc'
  };
  const overview = await getAdminAccessOverview({
    memberPage: query.memberPage,
    memberPageSize: query.memberPageSize,
    memberRecordState: query.memberRecordState !== 'active' ? query.memberRecordState : undefined,
    memberSearch: query.memberSearch || undefined,
    memberOrganizationId: query.memberOrganizationId || undefined,
    memberTenantId: query.memberTenantId || undefined,
    memberStatus: query.memberStatus !== 'all' ? query.memberStatus : undefined,
    memberPrivilege: query.memberPrivilege,
    memberRole: query.memberRole !== 'all' ? query.memberRole : undefined,
    memberSortBy: query.memberSortBy,
    memberSortOrder: query.memberSortOrder,
    invitationPage: 1,
    invitationPageSize: 5,
    invitationPrivilege: 'all',
    invitationSortBy: 'createdAt',
    invitationSortOrder: 'desc'
  });
  const session = await getAdminSession();
  const currentOperatorUserId = Number(session?.user.userId ?? NaN);

  const memberMetrics = overview.metrics.filter(
    (metric) => metric.key === 'members_total' || metric.key === 'privileged_members_total'
  );
  const activeInvitationMetric = overview.metrics.find(
    (metric) => metric.key === 'active_invitations_total'
  );
  const scopeLabel = query.memberScopeLabel || 'selected tenant';
  const hasMembershipScope = query.memberOrganizationId > 0 || query.memberTenantId > 0;
  const membershipResetHref = buildAccessHref(
    AccessRoute.Members,
    {
      memberOrganizationId: query.memberOrganizationId || undefined,
      memberTenantId: query.memberTenantId || undefined,
      memberScopeLabel: query.memberScopeLabel || undefined,
      memberPage: query.memberPage,
      memberPageSize: query.memberPageSize,
      memberRecordState: query.memberRecordState,
      memberSearch: query.memberSearch,
      memberStatus: query.memberStatus,
      memberPrivilege: query.memberPrivilege,
      memberRole: query.memberRole,
      memberSortBy: query.memberSortBy,
      memberSortOrder: query.memberSortOrder
    },
    {
      memberOrganizationId: query.memberOrganizationId || undefined,
      memberTenantId: query.memberTenantId || undefined,
      memberScopeLabel: query.memberScopeLabel || undefined,
      memberPage: 1,
      memberPageSize: 20,
      memberRecordState: undefined,
      memberSearch: undefined,
      memberStatus: undefined,
      memberPrivilege: undefined,
      memberRole: undefined,
      memberSortBy: 'displayName',
      memberSortOrder: 'asc'
    }
  );
  const activeMembershipFilters = [
    query.memberRecordState !== 'active' ? query.memberRecordState.replace('_', ' ') : null,
    query.memberStatus !== 'all' ? `Status: ${query.memberStatus}` : null,
    query.memberPrivilege !== 'all' ? `Privilege: ${query.memberPrivilege}` : null,
    query.memberRole !== 'all' ? `Role: ${formatRoleLabel(query.memberRole)}` : null,
    query.memberSearch ? `Search: ${query.memberSearch}` : null
  ].filter(Boolean) as string[];

  return (
    <AppPage className="space-y-7">
      <PageHeader
        title="Memberships"
        badge="Governance"
        description="Review organization membership records from one protected operator surface."
        actions={
          <Link href={AccessRoute.Invitations} className={accessActionClassName}>
            View invitations
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
                    Memberships
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Membership inventory grouped by organization, role, and access level.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{overview.membershipsPagination.total} membership records</span>
                  <span className="text-border">•</span>
                  <span>Generated {formatTimestamp(overview.generatedAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {hasMembershipScope ? (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                  >
                    Scope: {scopeLabel}
                  </Badge>
                ) : null}
                {activeMembershipFilters.map((filter) => (
                  <Badge
                    key={filter}
                    variant="outline"
                    size="sm"
                    className="border-border/70 bg-background/70 text-muted-foreground"
                  >
                    {filter}
                  </Badge>
                ))}
                {(hasMembershipScope || activeMembershipFilters.length > 0) && (
                  <Link
                    href={membershipResetHref}
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Reset memberships
                  </Link>
                )}
              </div>
            </div>

            {overview.memberships.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">No memberships</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust the current membership search or filters to broaden the inventory.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background/80">
                  <Table density="compact">
                    <TableHeader>
                      <TableRow className="bg-[hsl(var(--panel-subtle))]">
                        <TableHead className="px-4">Member</TableHead>
                        <TableHead className="px-4">Organization</TableHead>
                        <TableHead className="px-4">Membership</TableHead>
                        <TableHead className="px-4">Access</TableHead>
                        <TableHead className="px-4">Joined</TableHead>
                        <TableHead className="px-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.memberships.map((member) => {
                        const effectiveStatus = (
                          member.userDeletedAt ? 'deleted' : member.status
                        ) as AdminAccessMembershipStatus;
                        const status = getMembershipStatusPresentation(effectiveStatus);
                        const StatusIcon = status.icon;
                        const isCurrentOperator = currentOperatorUserId === member.userId;
                        const membershipLocked =
                          Boolean(member.userDeletedAt) || Boolean(member.organizationDeletedAt);
                        const userDeleteDisabledLabel = isCurrentOperator
                          ? 'Current user'
                          : 'Deleted user';

                        return (
                          <TableRow key={`${member.userId}-${member.tenantId}`}>
                            <TableCell className="align-top px-4">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  {member.isPrivileged ? (
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
                                      href={buildUserDetailHref(member.userId)}
                                      className="font-medium text-foreground underline-offset-4 hover:underline"
                                    >
                                      {getDisplayName(member)}
                                    </Link>
                                  </div>
                                </div>
                                {member.organizationDeletedAt ? (
                                  <Badge
                                    variant="outline"
                                    size="sm"
                                    className="border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300"
                                  >
                                    Organization deleted
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="align-top px-4">
                              <p className="font-medium text-foreground">
                                {member.organizationDisplayName ??
                                  member.organizationName ??
                                  'Unassigned organization'}
                              </p>
                            </TableCell>
                            <TableCell className="align-top px-4">
                              <div className="space-y-1.5">
                                <Badge
                                  variant="outline"
                                  size="sm"
                                  className={cn('flex w-fit items-center gap-1', status.className)}
                                >
                                  <StatusIcon className="h-3.5 w-3.5" />
                                  {status.label}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  size="sm"
                                  className={cn(getRoleTone(member.membershipRole))}
                                >
                                  {formatRoleLabel(member.membershipRole)}
                                </Badge>
                                {member.isDefault ? (
                                  <Badge variant="outline" size="sm">
                                    Default
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="align-top px-4">
                              <div className="space-y-1.5">
                                <Badge variant="outline" size="sm">
                                  {formatSystemRoles(member.systemRoles)}
                                </Badge>
                                {member.isPrivileged ? (
                                  <Badge
                                    variant="outline"
                                    size="sm"
                                    className="border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                                  >
                                    Privileged
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="align-top px-4 text-[11px] text-muted-foreground">
                              {formatTimestamp(member.createdAt)}
                            </TableCell>
                            <TableCell className="align-top px-4">
                              <InventoryRowActions label={`Actions for ${getDisplayName(member)}`}>
                                <InventoryRowActionsLabel>Membership</InventoryRowActionsLabel>
                                <InventoryRowActionLink href={buildUserDetailHref(member.userId)}>
                                  View user
                                </InventoryRowActionLink>
                                <InventoryRowActionLink
                                  href={buildMemberDetailHref(member.userId, member.tenantId)}
                                >
                                  View membership
                                </InventoryRowActionLink>
                                <InventoryRowActionLink
                                  href={`${AccessRoute.Invitations}?invitationSearch=${encodeURIComponent(
                                    String(
                                      member.organizationDisplayName ??
                                        member.organizationName ??
                                        ''
                                    )
                                  )}`}
                                >
                                  Search invitations
                                </InventoryRowActionLink>
                                <InventoryRowActionsSeparator />
                                <MembershipRemoveMenuItem
                                  userId={member.userId}
                                  tenantId={member.tenantId}
                                  disabled={membershipLocked}
                                  scopeLabel={
                                    member.organizationDisplayName ??
                                    member.organizationName ??
                                    `tenant ${member.tenantId}`
                                  }
                                />
                                {member.organizationId ? (
                                  <UserDeleteMenuItem
                                    userId={member.userId}
                                    organizationId={member.organizationId}
                                    displayName={getDisplayName(member)}
                                    disabled={isCurrentOperator || Boolean(member.userDeletedAt)}
                                    disabledLabel={userDeleteDisabledLabel}
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
                      {overview.membershipsPagination.hasPrevious ? (
                        <PaginationPrevious
                          href={buildAccessHref(AccessRoute.Members, query, {
                            memberPage: overview.membershipsPagination.page - 1
                          })}
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
                    page={overview.membershipsPagination.page}
                    totalPages={overview.membershipsPagination.totalPages}
                  />
                  <PaginationContent>
                    <PaginationItem>
                      {overview.membershipsPagination.hasNext ? (
                        <PaginationNext
                          href={buildAccessHref(AccessRoute.Members, query, {
                            memberPage: overview.membershipsPagination.page + 1
                          })}
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
          <AccessMetricsSummaryCard
            title="Membership summary"
            metrics={[
              ...memberMetrics,
              ...(activeInvitationMetric ? [activeInvitationMetric] : [])
            ]}
            footer={
              <Link href={AccessRoute.Invitations} className={accessActionClassName}>
                View invitations
              </Link>
            }
          />

          <AccessFilterShell
            title="Filters"
            description="Refine the membership list by name, status, privilege, and role."
          >
            <form action="/memberships" method="get" className="space-y-3">
              <input
                type="text"
                name="memberSearch"
                defaultValue={query.memberSearch}
                placeholder="Search membership or organization"
                className={accessInputClassName}
              />
              <input
                type="hidden"
                name="memberOrganizationId"
                value={query.memberOrganizationId || ''}
              />
              <input type="hidden" name="memberTenantId" value={query.memberTenantId || ''} />
              <input type="hidden" name="memberScopeLabel" value={query.memberScopeLabel} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <select
                  name="memberRecordState"
                  defaultValue={query.memberRecordState}
                  className={accessSelectClassName}
                >
                  <option value="active">Active records</option>
                  <option value="deleted">Deleted records</option>
                  <option value="all">All records</option>
                </select>
                <select
                  name="memberStatus"
                  defaultValue={query.memberStatus}
                  className={accessSelectClassName}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
                <select
                  name="memberPrivilege"
                  defaultValue={query.memberPrivilege}
                  className={accessSelectClassName}
                >
                  <option value="all">All privilege</option>
                  <option value="privileged">Privileged</option>
                  <option value="standard">Standard</option>
                </select>
                <select
                  name="memberRole"
                  defaultValue={query.memberRole}
                  className={accessSelectClassName}
                >
                  <option value="all">All roles</option>
                  <option value="tenant_owner">Tenant owner</option>
                  <option value="tenant_admin">Tenant admin</option>
                  <option value="tenant_user">Tenant user</option>
                  <option value="tenant_viewer">Tenant viewer</option>
                </select>
                <select
                  name="memberSortBy"
                  defaultValue={query.memberSortBy}
                  className={accessSelectClassName}
                >
                  <option value="displayName">Sort: Name</option>
                  <option value="status">Sort: Status</option>
                  <option value="membershipRole">Sort: Role</option>
                  <option value="createdAt">Sort: Joined</option>
                </select>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <select
                    name="memberSortOrder"
                    defaultValue={query.memberSortOrder}
                    className={accessSelectClassName}
                  >
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
                  <select
                    name="memberPageSize"
                    defaultValue={String(query.memberPageSize)}
                    className={accessSelectClassName}
                  >
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                </div>
              </div>
              <input type="hidden" name="memberPage" value="1" />
              <button type="submit" className={accessActionClassName}>
                Apply membership filters
              </button>
            </form>
          </AccessFilterShell>
        </div>
      </div>
    </AppPage>
  );
}

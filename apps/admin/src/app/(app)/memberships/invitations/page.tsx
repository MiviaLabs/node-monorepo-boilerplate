import Link from 'next/link';
import React from 'react';

import {
  accessActionClassName,
  accessInputClassName,
  accessSelectClassName,
  AccessRoute,
  AccessFilterShell,
  AccessMetricsSummaryCard,
  SearchParamsRecord,
  AccessPaginationSummary,
  buildAccessHref,
  formatRoleLabel,
  formatTimestamp,
  getInvitationStatusPresentation,
  getParam,
  getRoleTone,
  parsePositiveInt
} from '../_access-shared';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import {
  InventoryRowActionLink,
  InventoryRowActions,
  InventoryRowActionsLabel
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
import { cn } from '~/lib/utils';

export default async function AccessInvitationsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const query = {
    invitationPage: parsePositiveInt(getParam(resolvedParams, 'invitationPage'), 1),
    invitationPageSize: parsePositiveInt(getParam(resolvedParams, 'invitationPageSize'), 10),
    invitationOrganizationId: parsePositiveInt(
      getParam(resolvedParams, 'invitationOrganizationId'),
      0
    ),
    invitationTenantId: parsePositiveInt(getParam(resolvedParams, 'invitationTenantId'), 0),
    invitationScopeLabel: getParam(resolvedParams, 'invitationScopeLabel') ?? '',
    invitationSearch: getParam(resolvedParams, 'invitationSearch') ?? '',
    invitationStatus: getParam(resolvedParams, 'invitationStatus') ?? 'all',
    invitationPrivilege: getParam(resolvedParams, 'invitationPrivilege') ?? 'all',
    invitationRole: getParam(resolvedParams, 'invitationRole') ?? 'all',
    invitationSortBy: getParam(resolvedParams, 'invitationSortBy') ?? 'createdAt',
    invitationSortOrder: getParam(resolvedParams, 'invitationSortOrder') ?? 'desc'
  };
  const overview = await getAdminAccessOverview({
    memberPage: 1,
    memberPageSize: 1,
    memberPrivilege: 'all',
    memberSortBy: 'displayName',
    memberSortOrder: 'asc',
    invitationPage: query.invitationPage,
    invitationPageSize: query.invitationPageSize,
    invitationOrganizationId: query.invitationOrganizationId || undefined,
    invitationTenantId: query.invitationTenantId || undefined,
    invitationSearch: query.invitationSearch || undefined,
    invitationStatus: query.invitationStatus !== 'all' ? query.invitationStatus : undefined,
    invitationPrivilege: query.invitationPrivilege,
    invitationRole: query.invitationRole !== 'all' ? query.invitationRole : undefined,
    invitationSortBy: query.invitationSortBy,
    invitationSortOrder: query.invitationSortOrder
  });
  const invitationMetrics = overview.metrics.filter(
    (metric) =>
      metric.key === 'active_invitations_total' ||
      metric.key === 'expired_or_cancelled_invitations_total'
  );
  const invitationsResetHref = buildAccessHref(
    AccessRoute.Invitations,
    {
      invitationPage: query.invitationPage,
      invitationPageSize: query.invitationPageSize,
      invitationOrganizationId: query.invitationOrganizationId || undefined,
      invitationTenantId: query.invitationTenantId || undefined,
      invitationScopeLabel: query.invitationScopeLabel || undefined,
      invitationSearch: query.invitationSearch,
      invitationStatus: query.invitationStatus,
      invitationPrivilege: query.invitationPrivilege,
      invitationRole: query.invitationRole,
      invitationSortBy: query.invitationSortBy,
      invitationSortOrder: query.invitationSortOrder
    },
    {
      invitationPage: 1,
      invitationPageSize: 10,
      invitationOrganizationId: query.invitationOrganizationId || undefined,
      invitationTenantId: query.invitationTenantId || undefined,
      invitationScopeLabel: query.invitationScopeLabel || undefined,
      invitationSearch: undefined,
      invitationStatus: undefined,
      invitationPrivilege: undefined,
      invitationRole: undefined,
      invitationSortBy: 'createdAt',
      invitationSortOrder: 'desc'
    }
  );
  const activeInvitationFilters = [
    query.invitationScopeLabel ? `Scope: ${query.invitationScopeLabel}` : null,
    query.invitationStatus !== 'all' ? `Status: ${query.invitationStatus}` : null,
    query.invitationPrivilege !== 'all' ? `Privilege: ${query.invitationPrivilege}` : null,
    query.invitationRole !== 'all' ? `Role: ${formatRoleLabel(query.invitationRole)}` : null,
    query.invitationSearch ? `Search: ${query.invitationSearch}` : null
  ].filter(Boolean) as string[];

  return (
    <AppPage className="space-y-7">
      <PageHeader
        title="Invitations"
        badge="Governance"
        description="Inspect pending and historical invitation posture."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        <Card className="premium-panel rounded-xl border-border/70 xl:order-1">
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-col gap-3 border-b border-border/70 pb-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    Invitations
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Pending and historical invitation posture without exposing sensitive contact
                    detail.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{overview.invitationsPagination.total} invitation records</span>
                  <span className="text-border">•</span>
                  <span>Generated {formatTimestamp(overview.generatedAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeInvitationFilters.map((filter) => (
                  <Badge
                    key={filter}
                    variant="outline"
                    size="sm"
                    className="border-border/70 bg-background/70 text-muted-foreground"
                  >
                    {filter}
                  </Badge>
                ))}
                {activeInvitationFilters.length > 0 ? (
                  <Link
                    href={invitationsResetHref}
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Reset invitations
                  </Link>
                ) : null}
              </div>
            </div>

            {overview.invitations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">No invitations</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust the current invitation filters to broaden the inventory.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background/80">
                  <Table density="compact">
                    <TableHeader>
                      <TableRow className="bg-[hsl(var(--panel-subtle))]">
                        <TableHead className="px-4">Invitation</TableHead>
                        <TableHead className="px-4">Organization</TableHead>
                        <TableHead className="px-4">Role</TableHead>
                        <TableHead className="px-4">Status</TableHead>
                        <TableHead className="px-4">Timeline</TableHead>
                        <TableHead className="px-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.invitations.map((invitation) => (
                        <TableRow key={invitation.invitationId}>
                          <TableCell className="align-top px-4">
                            <div className="space-y-1.5">
                              <p className="font-medium text-foreground">
                                Invitation {invitation.invitationId}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {invitation.invitedByDisplayName
                                  ? `Invited by ${invitation.invitedByDisplayName}`
                                  : invitation.invitedByUserId
                                    ? 'Inviter unavailable'
                                    : 'Inviter unavailable'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="align-top px-4">
                            <div className="space-y-2">
                              <p className="font-medium text-foreground">
                                {invitation.organizationDisplayName ?? invitation.organizationName}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Badge
                                  variant="outline"
                                  size="sm"
                                  className="border-border/70 bg-background/70 text-muted-foreground"
                                >
                                  Tenant {invitation.tenantId}
                                </Badge>
                                {invitation.organizationSlug ? (
                                  <Badge
                                    variant="outline"
                                    size="sm"
                                    className="border-border/70 bg-background/70 text-muted-foreground"
                                  >
                                    /{invitation.organizationSlug}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top px-4">
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                size="sm"
                                className={cn(getRoleTone(invitation.role))}
                              >
                                {formatRoleLabel(invitation.role)}
                              </Badge>
                              {invitation.isPrivileged ? (
                                <Badge
                                  variant="outline"
                                  size="sm"
                                  className="border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                                >
                                  Privileged invite
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  size="sm"
                                  className="border-border/70 bg-background/70 text-muted-foreground"
                                >
                                  Standard invite
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top px-4">
                            <Badge
                              variant="outline"
                              size="sm"
                              className={cn(getInvitationStatusPresentation(invitation.status))}
                            >
                              {formatRoleLabel(invitation.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top px-4">
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <p>Created {formatTimestamp(invitation.createdAt)}</p>
                              <p>
                                {invitation.expiresAt
                                  ? `Expires ${formatTimestamp(invitation.expiresAt)}`
                                  : 'No expiry recorded'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="align-top px-4">
                            <InventoryRowActions
                              label={`Actions for invitation ${invitation.invitationId}`}
                            >
                              <InventoryRowActionsLabel>Invitation</InventoryRowActionsLabel>
                              <InventoryRowActionLink
                                href={`${AccessRoute.Members}?memberOrganizationId=${invitation.organizationId}&memberTenantId=${invitation.tenantId}&memberScopeLabel=${encodeURIComponent(
                                  invitation.organizationDisplayName ?? invitation.organizationName
                                )}`}
                              >
                                View memberships
                              </InventoryRowActionLink>
                            </InventoryRowActions>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Pagination className="justify-between">
                  <PaginationContent>
                    <PaginationItem>
                      {overview.invitationsPagination.hasPrevious ? (
                        <PaginationPrevious
                          href={buildAccessHref(AccessRoute.Invitations, query, {
                            invitationPage: overview.invitationsPagination.page - 1
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
                    page={overview.invitationsPagination.page}
                    totalPages={overview.invitationsPagination.totalPages}
                  />
                  <PaginationContent>
                    <PaginationItem>
                      {overview.invitationsPagination.hasNext ? (
                        <PaginationNext
                          href={buildAccessHref(AccessRoute.Invitations, query, {
                            invitationPage: overview.invitationsPagination.page + 1
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
          <AccessMetricsSummaryCard title="Invitation summary" metrics={invitationMetrics} />

          <AccessFilterShell
            title="Filters"
            description="Trim the invitation list by status, privilege, role, and organization."
          >
            <form action="/memberships/invitations" method="get" className="space-y-3">
              <input
                type="text"
                name="invitationSearch"
                defaultValue={query.invitationSearch}
                placeholder="Search org or inviter"
                className={accessInputClassName}
              />
              <input
                type="hidden"
                name="invitationOrganizationId"
                value={query.invitationOrganizationId || ''}
              />
              <input
                type="hidden"
                name="invitationTenantId"
                value={query.invitationTenantId || ''}
              />
              <input type="hidden" name="invitationScopeLabel" value={query.invitationScopeLabel} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <select
                  name="invitationStatus"
                  defaultValue={query.invitationStatus}
                  className={accessSelectClassName}
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select
                  name="invitationPrivilege"
                  defaultValue={query.invitationPrivilege}
                  className={accessSelectClassName}
                >
                  <option value="all">All privilege</option>
                  <option value="privileged">Privileged</option>
                  <option value="standard">Standard</option>
                </select>
                <select
                  name="invitationRole"
                  defaultValue={query.invitationRole}
                  className={accessSelectClassName}
                >
                  <option value="all">All roles</option>
                  <option value="tenant_owner">Tenant owner</option>
                  <option value="tenant_admin">Tenant admin</option>
                  <option value="tenant_user">Tenant user</option>
                  <option value="tenant_viewer">Tenant viewer</option>
                </select>
                <select
                  name="invitationSortBy"
                  defaultValue={query.invitationSortBy}
                  className={accessSelectClassName}
                >
                  <option value="createdAt">Sort: Created</option>
                  <option value="status">Sort: Status</option>
                  <option value="role">Sort: Role</option>
                  <option value="organizationName">Sort: Organization</option>
                </select>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <select
                    name="invitationSortOrder"
                    defaultValue={query.invitationSortOrder}
                    className={accessSelectClassName}
                  >
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </select>
                  <select
                    name="invitationPageSize"
                    defaultValue={String(query.invitationPageSize)}
                    className={accessSelectClassName}
                  >
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                  </select>
                </div>
              </div>
              <input type="hidden" name="invitationPage" value="1" />
              <button type="submit" className={accessActionClassName}>
                Apply invitation filters
              </button>
            </form>
          </AccessFilterShell>
        </div>
      </div>
    </AppPage>
  );
}

import { BadgeCheck, BellRing, Building, Building2, Radar, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import type {
  AdminTenantInventoryItem,
  AdminTenantOnboardingState,
  AdminTenantStatus
} from '~/lib/admin';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { TenantDeleteMenuItem } from '~/components/admin/inventory-danger-actions';
import {
  InventoryRowActionLink,
  InventoryRowActions,
  InventoryRowActionsLabel,
  InventoryRowActionsSeparator
} from '~/components/admin/inventory-row-actions';
import { TenantCreateDialog } from '~/components/admin/tenant-lifecycle-controls';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
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
import { getAdminTenantsOverview } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';
import { cn } from '~/lib/utils';

type SearchParamsRecord = Record<string, string | string[] | undefined>;

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getParam(params: SearchParamsRecord, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function buildHref(
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
  return query.length > 0 ? `/tenants?${query}` : '/tenants';
}

function buildMembershipsHref(item: AdminTenantInventoryItem) {
  const searchParams = new URLSearchParams({
    memberOrganizationId: String(item.organizationId),
    memberTenantId: String(item.tenantId),
    memberScopeLabel: item.displayName ?? item.name
  });

  return `/memberships?${searchParams.toString()}`;
}

function buildUsersHref(item: AdminTenantInventoryItem) {
  const searchParams = new URLSearchParams({
    userTenantId: String(item.tenantId),
    userScopeLabel: item.displayName ?? item.name
  });

  return `/users?${searchParams.toString()}`;
}

function buildTenantDetailHref(item: AdminTenantInventoryItem) {
  return `/tenants/${item.organizationId}`;
}

function buildEmailsHref(item: AdminTenantInventoryItem) {
  const searchParams = new URLSearchParams({
    organizationId: String(item.organizationId)
  });

  return `/system/emails?${searchParams.toString()}`;
}

function buildEmailWebhooksHref(item: AdminTenantInventoryItem) {
  const searchParams = new URLSearchParams({
    organizationId: String(item.organizationId)
  });

  return `/system/email-webhooks?${searchParams.toString()}`;
}

function getStatusPresentation(status: AdminTenantStatus) {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        className: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
      };
    case 'trial':
      return {
        label: 'Trial',
        className: 'border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300'
      };
    case 'suspended':
      return {
        label: 'Suspended',
        className: 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300'
      };
    case 'deleted':
      return {
        label: 'Deleted',
        className: 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300'
      };
    default:
      return {
        label: 'Draft',
        className: 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300'
      };
  }
}

function getOnboardingPresentation(state: AdminTenantOnboardingState) {
  switch (state) {
    case 'ready':
      return {
        label: 'Ready',
        icon: BadgeCheck,
        className: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
      };
    case 'invited':
      return {
        label: 'Pending invites',
        icon: BellRing,
        className: 'border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300'
      };
    case 'provisioning':
      return {
        label: 'Provisioning',
        icon: Radar,
        className: 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300'
      };
    case 'setup':
      return {
        label: 'Setup',
        icon: ShieldAlert,
        className: 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300'
      };
    case 'archived':
      return {
        label: 'Archived',
        icon: ShieldAlert,
        className: 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300'
      };
    default:
      return {
        label: 'Attention',
        icon: ShieldAlert,
        className: 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300'
      };
  }
}

function getOwnerText(item: AdminTenantInventoryItem) {
  if (!item.hasOwner) {
    return 'Owner not assigned';
  }

  if (!item.ownerDisplayName) {
    return 'Owner record unavailable';
  }

  return item.ownerDisplayName;
}

function InventoryRailCard({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="premium-panel rounded-xl border-border/70 shadow-[0_1px_0_hsl(var(--border)/0.35)]">
      <CardHeader className="space-y-1.5 pb-3">
        <CardTitle className="text-sm tracking-[-0.02em]">{title}</CardTitle>
        {description ? (
          <CardDescription className="text-[11px] leading-5">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function TenantContextRail({
  generatedAt,
  total,
  page,
  totalPages,
  resetHref
}: {
  generatedAt: string;
  total: number;
  page: number;
  totalPages: number;
  resetHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{total} tenant records</span>
        <span className="text-border">•</span>
        <span>
          Page {page}
          {totalPages > 0 ? ` of ${totalPages}` : ''}
        </span>
        <span className="text-border">•</span>
        <span>Generated {formatTimestamp(generatedAt)}</span>
      </div>
      <Link
        href={resetHref}
        className="inline-flex items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Clear filters
      </Link>
    </div>
  );
}

export default async function TenantsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const query = {
    page: parsePositiveInt(getParam(resolvedParams, 'page'), 1),
    pageSize: parsePositiveInt(getParam(resolvedParams, 'pageSize'), 20),
    recordState:
      getParam(resolvedParams, 'recordState') ??
      (getParam(resolvedParams, 'status') === 'deleted' ? 'deleted' : 'active'),
    search: getParam(resolvedParams, 'search') ?? '',
    status: getParam(resolvedParams, 'status') ?? 'all',
    onboardingState: getParam(resolvedParams, 'onboardingState') ?? 'all',
    sortBy: getParam(resolvedParams, 'sortBy') ?? 'name',
    sortOrder: getParam(resolvedParams, 'sortOrder') ?? 'asc'
  };
  const overview = await getAdminTenantsOverview({
    page: query.page,
    pageSize: query.pageSize,
    recordState: query.recordState !== 'active' ? query.recordState : undefined,
    search: query.search || undefined,
    status: query.status !== 'all' ? query.status : undefined,
    onboardingState: query.onboardingState !== 'all' ? query.onboardingState : undefined,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder
  });
  const session = await getAdminSession();
  const canCreateTenant = session?.user.permissions.includes('system:tenants:create') ?? false;

  return (
    <AppPage className="space-y-5">
      <PageHeader
        title="Tenants"
        badge="Inventory"
        description="Review tenant lifecycle, ownership posture, and onboarding risk without losing the list workspace."
        actions={<TenantCreateDialog canCreate={canCreateTenant} />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        <aside className="space-y-4 xl:order-2 xl:sticky xl:top-4 xl:self-start">
          <InventoryRailCard
            title="Insights"
            description="Use this summary for triage, then move back to the live inventory."
          >
            <div className="space-y-2">
              {overview.metrics.map((metric) => (
                <div
                  key={metric.key}
                  className="flex items-start justify-between gap-3 rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2"
                >
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
                      {metric.label}
                    </p>
                    <p className="text-base font-semibold tracking-[-0.04em] text-foreground">
                      {metric.value}
                    </p>
                    {metric.summary ? (
                      <p className="text-[11px] leading-4 text-muted-foreground">
                        {metric.summary}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </InventoryRailCard>

          <InventoryRailCard
            title="Filters"
            description="Keep broad filters here and use the main toolbar for quick list updates."
          >
            <form action="/tenants" method="get" className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="tenant-search-rail"
                  className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Search
                </label>
                <input
                  id="tenant-search-rail"
                  type="text"
                  name="search"
                  defaultValue={query.search}
                  placeholder="Search tenant or owner"
                  className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <label className="space-y-1.5">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Record state
                  </span>
                  <select
                    name="recordState"
                    defaultValue={query.recordState}
                    className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="active">Active records</option>
                    <option value="deleted">Deleted records</option>
                    <option value="all">All records</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Status
                  </span>
                  <select
                    name="status"
                    defaultValue={query.status}
                    className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="draft">Draft</option>
                    <option value="suspended">Suspended</option>
                    <option value="deleted">Deleted</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Onboarding
                  </span>
                  <select
                    name="onboardingState"
                    defaultValue={query.onboardingState}
                    className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="all">All onboarding</option>
                    <option value="ready">Ready</option>
                    <option value="invited">Pending invites</option>
                    <option value="provisioning">Provisioning</option>
                    <option value="setup">Setup</option>
                    <option value="attention">Attention</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
                <button
                  type="submit"
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-background/80"
                >
                  Apply
                </button>
                <Link
                  href="/tenants"
                  className="inline-flex items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Clear filters
                </Link>
              </div>
            </form>
          </InventoryRailCard>
        </aside>

        <Card className="premium-panel rounded-xl border-border/70 shadow-[0_1px_0_hsl(var(--border)/0.35)] xl:order-1">
          <CardHeader className="gap-3 border-b border-border/70 pb-4">
            <div className="space-y-1">
              <Badge
                variant="secondary"
                className="w-fit rounded-md px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]"
              >
                Inventory
              </Badge>
              <div className="space-y-1">
                <CardTitle className="text-lg tracking-[-0.03em]">Tenant inventory</CardTitle>
                <CardDescription className="text-sm leading-6">
                  Results stay in view while search, sort, and page size stay close to the table.
                </CardDescription>
              </div>
            </div>

            <TenantContextRail
              generatedAt={overview.generatedAt}
              total={overview.pagination.total}
              page={overview.pagination.page}
              totalPages={overview.pagination.totalPages}
              resetHref="/tenants"
            />

            <form
              action="/tenants"
              method="get"
              className="grid gap-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.8fr))_auto]"
            >
              <input
                type="text"
                name="search"
                defaultValue={query.search}
                placeholder="Search tenant or owner"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              />
              <select
                name="sortBy"
                defaultValue={query.sortBy}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              >
                <option value="name">Sort: Name</option>
                <option value="status">Sort: Status</option>
                <option value="memberCount">Sort: Members</option>
                <option value="pendingInvitationCount">Sort: Invitations</option>
                <option value="updatedAt">Sort: Updated</option>
                <option value="createdAt">Sort: Created</option>
              </select>
              <select
                name="sortOrder"
                defaultValue={query.sortOrder}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
              <select
                name="pageSize"
                defaultValue={String(query.pageSize)}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              >
                <option value="10">10 rows</option>
                <option value="20">20 rows</option>
                <option value="50">50 rows</option>
              </select>
              <input type="hidden" name="recordState" value={query.recordState} />
              <input type="hidden" name="status" value={query.status} />
              <input type="hidden" name="onboardingState" value={query.onboardingState} />
              <input type="hidden" name="page" value="1" />
              <button
                type="submit"
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-background/80"
              >
                Update list
              </button>
            </form>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {overview.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-10 text-center">
                <p className="text-sm font-medium text-foreground">No tenants available</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust the current search or filters to broaden the inventory.
                </p>
              </div>
            ) : (
              <>
                <Table density="compact">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead className="pl-4">Tenant</TableHead>
                      <TableHead>Lifecycle</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Membership</TableHead>
                      <TableHead className="pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.items.map((item) => {
                      const status = getStatusPresentation(item.status);
                      const onboarding = getOnboardingPresentation(item.onboardingState);
                      const OnboardingIcon = onboarding.icon;

                      return (
                        <TableRow
                          key={`${item.tenantId}-${item.organizationId}`}
                          className="align-top"
                        >
                          <TableCell className="pl-4 align-top">
                            <div className="space-y-1.5">
                              <div className="flex items-start gap-2.5">
                                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] text-muted-foreground">
                                  {item.tenantType === 'organization' ? (
                                    <Building2 className="h-4 w-4" />
                                  ) : (
                                    <Building className="h-4 w-4" />
                                  )}
                                </span>
                                <div>
                                  <Link
                                    href={buildTenantDetailHref(item)}
                                    className="font-medium leading-5 text-foreground underline-offset-4 hover:underline"
                                  >
                                    {item.displayName ?? item.name}
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="space-y-1.5">
                              <Badge variant="outline" size="sm" className={cn(status.className)}>
                                {status.label}
                              </Badge>
                              <Badge
                                variant="outline"
                                size="sm"
                                className={cn(
                                  'flex w-fit items-center gap-1',
                                  onboarding.className
                                )}
                              >
                                <OnboardingIcon className="h-3.5 w-3.5" />
                                {onboarding.label}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="space-y-1.5">
                              <p className="font-medium leading-5 text-foreground">
                                {getOwnerText(item)}
                              </p>
                              <p className="text-[11px] leading-4 text-muted-foreground">
                                {item.hasOwner
                                  ? item.ownerActive
                                    ? 'Owner active'
                                    : 'Owner needs attention'
                                  : 'No owner assigned'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <p className="text-sm font-medium text-foreground">
                              {item.memberCount}
                            </p>
                          </TableCell>
                          <TableCell className="pr-4 align-top">
                            <InventoryRowActions
                              label={`Actions for ${item.displayName ?? item.name}`}
                            >
                              <InventoryRowActionsLabel>Tenant</InventoryRowActionsLabel>
                              <InventoryRowActionLink href={buildUsersHref(item)}>
                                View users
                              </InventoryRowActionLink>
                              <InventoryRowActionLink href={buildMembershipsHref(item)}>
                                View memberships
                              </InventoryRowActionLink>
                              <InventoryRowActionLink href={buildEmailsHref(item)}>
                                View emails
                              </InventoryRowActionLink>
                              <InventoryRowActionLink href={buildEmailWebhooksHref(item)}>
                                View email webhooks
                              </InventoryRowActionLink>
                              <InventoryRowActionsSeparator />
                              <TenantDeleteMenuItem
                                tenantId={item.tenantId}
                                name={item.displayName ?? item.name}
                                disabled={Boolean(item.deletedAt) || item.isDeleted}
                              />
                            </InventoryRowActions>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <Pagination className="justify-between rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2">
                  <PaginationContent>
                    <PaginationItem>
                      {overview.pagination.hasPrevious ? (
                        <PaginationPrevious
                          href={buildHref(query, { page: overview.pagination.page - 1 })}
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
                  <div className="text-sm text-muted-foreground">
                    Page {overview.pagination.page}
                    {overview.pagination.totalPages > 0
                      ? ` of ${overview.pagination.totalPages}`
                      : ''}
                  </div>
                  <PaginationContent>
                    <PaginationItem>
                      {overview.pagination.hasNext ? (
                        <PaginationNext
                          href={buildHref(query, { page: overview.pagination.page + 1 })}
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
      </div>
    </AppPage>
  );
}

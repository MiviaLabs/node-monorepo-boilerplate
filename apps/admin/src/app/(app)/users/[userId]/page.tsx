import { ChevronRight, ShieldCheck, ShieldUser, UserRoundCog, Users2 } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import React from 'react';

import {
  formatRoleLabel,
  formatSystemRoles,
  formatTimestamp,
  getMembershipStatusPresentation,
  getRoleTone
} from '../../memberships/_access-shared';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { Badge } from '~/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '~/components/ui/breadcrumb';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '~/components/ui/table';
import { ApiClientError } from '~/lib/api-client';
import { getAdminUserDetail } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';
import { cn } from '~/lib/utils';

function DetailCard({
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
      <CardHeader className="space-y-1.5 border-b border-border/70 px-4 py-3">
        <CardTitle className="text-base tracking-[-0.02em]">{title}</CardTitle>
        {description ? (
          <CardDescription className="text-xs leading-5">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="px-4 py-4">{children}</CardContent>
    </Card>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium leading-5 text-foreground">{value}</p>
    </div>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  summary
}: {
  icon: typeof Users2;
  label: string;
  value: string;
  summary: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold text-foreground">{value}</p>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{summary}</p>
    </div>
  );
}

function formatBoolean(value: boolean) {
  return value ? 'Yes' : 'No';
}

async function loadUserDetail(userId: number) {
  try {
    return await getAdminUserDetail(userId);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}

function buildMembershipDetailHref(userId: number, tenantId: number) {
  return `/memberships/${userId}?tenantId=${tenantId}`;
}

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const resolvedParams = await params;
  const userId = Number(resolvedParams.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    notFound();
  }

  const detail = await loadUserDetail(userId);
  const session = await getAdminSession();
  const defaultMembership = detail.memberships.find((membership) => membership.isDefault);
  const canExportOwnData = session?.user.userId === String(detail.userId);

  return (
    <AppPage className="space-y-5">
      <div className="space-y-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/users">Users</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-3.5 w-3.5" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>{detail.displayName ?? `User ${detail.userId}`}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          title={detail.displayName ?? `User ${detail.userId}`}
          badge="User"
          description="Inspect global account posture, auth providers, and every organization membership from one admin detail view."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" size="sm">
                {detail.userLifecycle === 'deleted'
                  ? 'Deleted'
                  : detail.userActive
                    ? 'Active'
                    : 'Inactive'}
              </Badge>
              {detail.isPrivileged ? (
                <Badge
                  variant="outline"
                  size="sm"
                  className="border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                >
                  Privileged
                </Badge>
              ) : null}
            </div>
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <DetailCard
            title="Summary"
            description={`Generated ${formatTimestamp(detail.generatedAt)}`}
          >
            <div className="space-y-2">
              <SummaryMetric
                icon={Users2}
                label="Memberships"
                value={String(detail.membershipStats.totalMemberships)}
                summary={`${detail.membershipStats.activeMemberships} active, ${detail.membershipStats.suspendedMemberships} suspended`}
              />
              <SummaryMetric
                icon={ShieldUser}
                label="Privilege"
                value={detail.isPrivileged ? 'Privileged' : 'Standard'}
                summary={`${detail.membershipStats.privilegedMemberships} privileged memberships overall`}
              />
              <SummaryMetric
                icon={ShieldCheck}
                label="System roles"
                value={detail.systemRoles.length > 0 ? String(detail.systemRoles.length) : '0'}
                summary={formatSystemRoles(detail.systemRoles)}
              />
              <SummaryMetric
                icon={UserRoundCog}
                label="Identity"
                value={detail.identity.provider ?? 'No primary identity'}
                summary={
                  detail.identity.providersInUse.length > 0
                    ? detail.identity.providersInUse.join(' • ')
                    : 'No providers reported'
                }
              />
            </div>
          </DetailCard>
        </aside>

        <div className="min-w-0 space-y-4">
          <DetailCard
            title="User profile"
            description="Core global account and organization context."
          >
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <DetailField label="User ID" value={String(detail.userId)} />
              <DetailField
                label="Display name"
                value={detail.displayName ?? `User ${detail.userId}`}
              />
              <DetailField
                label="Primary organization"
                value={detail.organizationDisplayName ?? detail.organizationName ?? 'Not set'}
              />
              <DetailField
                label="Organization ID"
                value={detail.organizationId ? String(detail.organizationId) : 'Not set'}
              />
              <DetailField label="Lifecycle" value={formatRoleLabel(detail.userLifecycle)} />
              <DetailField label="Active account" value={formatBoolean(detail.userActive)} />
              <DetailField label="Verified account" value={formatBoolean(detail.userVerified)} />
              <DetailField label="Created" value={formatTimestamp(detail.userCreatedAt)} />
              <DetailField label="Updated" value={formatTimestamp(detail.userUpdatedAt)} />
              <DetailField
                label="Last sign-in"
                value={detail.lastSignInAt ? formatTimestamp(detail.lastSignInAt) : 'Unknown'}
              />
              <DetailField
                label="Deleted at"
                value={detail.userDeletedAt ? formatTimestamp(detail.userDeletedAt) : 'Not deleted'}
              />
            </div>
          </DetailCard>

          <div className="grid gap-4 2xl:grid-cols-2">
            <DetailCard
              title="Identity and roles"
              description="Primary auth posture and system authorization."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailField
                  label="Primary provider"
                  value={detail.identity.provider ?? 'Not reported'}
                />
                <DetailField
                  label="Provider display"
                  value={detail.identity.providerDisplayName ?? 'Not reported'}
                />
                <DetailField
                  label="Has primary identity"
                  value={formatBoolean(detail.identity.hasPrimaryIdentity)}
                />
                <DetailField
                  label="Email verified"
                  value={formatBoolean(detail.identity.emailVerified)}
                />
                <DetailField
                  label="Phone verified"
                  value={formatBoolean(detail.identity.phoneVerified)}
                />
                <DetailField label="System roles" value={formatSystemRoles(detail.systemRoles)} />
                <DetailField
                  label="Identity count"
                  value={String(detail.identity.totalIdentities)}
                />
                <DetailField
                  label="Providers in use"
                  value={
                    detail.identity.providersInUse.length > 0
                      ? detail.identity.providersInUse.join(' • ')
                      : 'None'
                  }
                />
              </div>
            </DetailCard>

            <DetailCard
              title="Membership posture"
              description="Aggregate access footprint across organizations."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailField
                  label="Total memberships"
                  value={String(detail.membershipStats.totalMemberships)}
                />
                <DetailField
                  label="Active memberships"
                  value={String(detail.membershipStats.activeMemberships)}
                />
                <DetailField
                  label="Suspended memberships"
                  value={String(detail.membershipStats.suspendedMemberships)}
                />
                <DetailField
                  label="Privileged memberships"
                  value={String(detail.membershipStats.privilegedMemberships)}
                />
              </div>
            </DetailCard>
          </div>

          <DetailCard
            title="Data export"
            description="Admin passthrough to the backend GDPR export contract."
          >
            {canExportOwnData ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-xl text-sm text-muted-foreground">
                  Download your own operator account export as JSON. The backend treats this as a
                  self-service, audited export action.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/auth/account/${detail.userId}/export`} download>
                    Download my account export
                  </a>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Exports are currently limited to the current operator account. Exporting another
                user&#39;s data remains blocked by the backend policy contract.
              </p>
            )}
          </DetailCard>

          <DetailCard
            title="Memberships"
            description="Every current membership associated with this user."
          >
            <Table density="compact">
              <TableHeader sticky>
                <TableRow>
                  <TableHead className="pl-3">Organization</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="pr-3">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.memberships.map((membership) => {
                  const status = getMembershipStatusPresentation(membership.status);
                  const StatusIcon = status.icon;
                  const detailHref = buildMembershipDetailHref(detail.userId, membership.tenantId);

                  return (
                    <TableRow key={membership.tenantId}>
                      <TableCell className="pl-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {membership.organizationDisplayName ??
                              membership.organizationName ??
                              `Tenant ${membership.tenantId}`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Tenant {membership.tenantId}
                            {membership.organizationSlug
                              ? ` • /${membership.organizationSlug}`
                              : ''}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          size="sm"
                          className={cn(getRoleTone(membership.membershipRole))}
                        >
                          {formatRoleLabel(membership.membershipRole)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          size="sm"
                          className={cn('flex w-fit items-center gap-1', status.className)}
                        >
                          <StatusIcon className="h-3.5 w-3.5" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {membership.isDefault ? (
                            <Badge variant="outline" size="sm">
                              Default
                            </Badge>
                          ) : null}
                          {membership.isPrivileged ? (
                            <Badge variant="outline" size="sm">
                              Privileged
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="pr-3">
                        <Link
                          href={detailHref}
                          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          View membership
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </DetailCard>

          <DetailCard
            title="Quick navigation"
            description="Jump back into user, organization, and membership workflows."
          >
            <div className="flex flex-wrap gap-2">
              {detail.organizationId ? (
                <Link
                  href={`/tenants/${detail.organizationId}`}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                >
                  View organization
                </Link>
              ) : null}
              {defaultMembership ? (
                <Link
                  href={buildMembershipDetailHref(detail.userId, defaultMembership.tenantId)}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                >
                  View default membership
                </Link>
              ) : null}
              <Link
                href="/users"
                className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
              >
                Back to users
              </Link>
            </div>
          </DetailCard>
        </div>
      </div>
    </AppPage>
  );
}

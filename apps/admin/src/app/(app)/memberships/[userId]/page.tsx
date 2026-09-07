import { ChevronRight, ShieldCheck, ShieldUser, UserRoundCog, Users2 } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import React from 'react';

import {
  formatRoleLabel,
  formatSystemRoles,
  formatTimestamp,
  getMembershipStatusPresentation,
  getRoleTone,
  getParam,
  parsePositiveInt,
  SearchParamsRecord
} from '../_access-shared';

import type { AdminMemberDetail } from '~/lib/admin';

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
import { getAdminMemberDetail } from '~/lib/admin';
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

async function loadMemberDetail(userId: number, tenantId: number) {
  try {
    return await getAdminMemberDetail(userId, tenantId);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}

function buildMemberBackHref(detail: AdminMemberDetail) {
  const params = new URLSearchParams({
    memberOrganizationId: String(detail.organizationId ?? ''),
    memberTenantId: String(detail.tenantId),
    memberScopeLabel:
      detail.organizationDisplayName ??
      detail.organizationName ??
      detail.displayName ??
      'Membership'
  });

  return `/memberships?${params.toString()}`;
}

function buildInvitationHref(detail: AdminMemberDetail) {
  const params = new URLSearchParams({
    invitationOrganizationId: String(detail.organizationId ?? ''),
    invitationTenantId: String(detail.tenantId),
    invitationScopeLabel:
      detail.organizationDisplayName ??
      detail.organizationName ??
      detail.displayName ??
      'Membership'
  });

  return `/memberships/invitations?${params.toString()}`;
}

function buildUserHref(detail: AdminMemberDetail) {
  return `/users/${detail.userId}`;
}

export default async function MemberDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const userId = Number(resolvedParams.userId);
  const tenantId = parsePositiveInt(getParam(resolvedSearchParams, 'tenantId'), 0);

  if (!Number.isInteger(userId) || userId <= 0 || tenantId <= 0) {
    notFound();
  }

  const detail = await loadMemberDetail(userId, tenantId);
  const status = getMembershipStatusPresentation(detail.userDeletedAt ? 'deleted' : detail.status);
  const StatusIcon = status.icon;

  return (
    <AppPage className="space-y-5">
      <div className="space-y-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={buildMemberBackHref(detail)}>Memberships</Link>
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
          badge="Membership"
          description="Inspect one membership in context, including tenant posture, system roles, identity state, and other memberships."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                size="sm"
                className={cn('flex items-center gap-1', status.className)}
              >
                <StatusIcon className="h-3.5 w-3.5" />
                {status.label}
              </Badge>
              <Badge variant="outline" size="sm" className={cn(getRoleTone(detail.membershipRole))}>
                {formatRoleLabel(detail.membershipRole)}
              </Badge>
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
                summary={detail.identity.emailVerified ? 'Email verified' : 'Email unverified'}
              />
            </div>
          </DetailCard>
        </aside>

        <div className="min-w-0 space-y-4">
          <DetailCard
            title="Current membership"
            description="The selected membership record from the memberships inventory."
          >
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <DetailField label="User ID" value={String(detail.userId)} />
              <DetailField label="Tenant ID" value={String(detail.tenantId)} />
              <DetailField
                label="Organization ID"
                value={detail.organizationId ? String(detail.organizationId) : 'Not set'}
              />
              <DetailField
                label="Organization"
                value={
                  detail.organizationDisplayName ??
                  detail.organizationName ??
                  'Unassigned organization'
                }
              />
              <DetailField label="Role" value={formatRoleLabel(detail.membershipRole)} />
              <DetailField label="Status" value={status.label} />
              <DetailField label="Default membership" value={formatBoolean(detail.isDefault)} />
              <DetailField label="Privileged" value={formatBoolean(detail.isPrivileged)} />
              <DetailField label="Tenant status" value={formatRoleLabel(detail.tenantStatus)} />
              <DetailField label="Joined" value={formatTimestamp(detail.membershipCreatedAt)} />
              <DetailField label="Updated" value={formatTimestamp(detail.membershipUpdatedAt)} />
              <DetailField label="Tenant type" value={formatRoleLabel(detail.tenantType)} />
            </div>
          </DetailCard>

          <div className="grid gap-4 2xl:grid-cols-2">
            <DetailCard
              title="User posture"
              description="Account-level lifecycle and verification state."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailField
                  label="Display name"
                  value={detail.displayName ?? `User ${detail.userId}`}
                />
                <DetailField label="Active account" value={formatBoolean(detail.userActive)} />
                <DetailField label="Verified account" value={formatBoolean(detail.userVerified)} />
                <DetailField label="User lifecycle" value={formatRoleLabel(detail.userLifecycle)} />
                <DetailField label="Created" value={formatTimestamp(detail.userCreatedAt)} />
                <DetailField label="Updated" value={formatTimestamp(detail.userUpdatedAt)} />
                <DetailField
                  label="Last sign-in"
                  value={detail.lastSignInAt ? formatTimestamp(detail.lastSignInAt) : 'Unknown'}
                />
                <DetailField
                  label="Deleted at"
                  value={
                    detail.userDeletedAt ? formatTimestamp(detail.userDeletedAt) : 'Not deleted'
                  }
                />
              </div>
            </DetailCard>

            <DetailCard
              title="Identity and roles"
              description="Primary authentication posture and system-level authorization."
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
              </div>
            </DetailCard>
          </div>

          <DetailCard
            title="Other memberships"
            description="All memberships currently associated with this user across tenants."
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
                {detail.otherMemberships.map((membership) => {
                  const membershipStatus = getMembershipStatusPresentation(membership.status);
                  const MembershipStatusIcon = membershipStatus.icon;
                  const detailHref = `/memberships/${detail.userId}?tenantId=${membership.tenantId}`;

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
                          className={cn(
                            'flex w-fit items-center gap-1',
                            membershipStatus.className
                          )}
                        >
                          <MembershipStatusIcon className="h-3.5 w-3.5" />
                          {membershipStatus.label}
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
                          {membership.isCurrent ? (
                            <Badge variant="outline" size="sm">
                              Current
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="pr-3">
                        {membership.isCurrent ? (
                          <Badge variant="outline" size="sm">
                            Open
                          </Badge>
                        ) : (
                          <Link
                            href={detailHref}
                            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          >
                            View membership
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </DetailCard>

          <DetailCard
            title="Quick navigation"
            description="Jump back into the surrounding organization workflows."
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
              <Link
                href={buildUserHref(detail)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
              >
                View user
              </Link>
              <Link
                href={buildMemberBackHref(detail)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
              >
                Back to memberships
              </Link>
              <Link
                href={buildInvitationHref(detail)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
              >
                View invitations
              </Link>
            </div>
          </DetailCard>
        </div>
      </div>
    </AppPage>
  );
}

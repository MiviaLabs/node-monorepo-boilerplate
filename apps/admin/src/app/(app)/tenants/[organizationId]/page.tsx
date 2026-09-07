import {
  BadgeCheck,
  BellRing,
  ChevronRight,
  KeyRound,
  Radar,
  ShieldAlert,
  ShieldUser,
  Users2
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import React from 'react';

import type {
  AdminTenantDetail,
  AdminTenantOnboardingState,
  AdminTenantStatus,
  AdminTenantType
} from '~/lib/admin';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { TenantLifecycleEditor } from '~/components/admin/tenant-lifecycle-controls';
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
import { getAdminTenantDetail } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';
import { cn } from '~/lib/utils';

function formatTimestamp(value?: string) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatNumber(value?: number) {
  if (value === undefined) {
    return 'Not set';
  }

  return new Intl.NumberFormat('en').format(value);
}

function formatTenantType(value: AdminTenantType) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatStatusLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatBoolean(value?: boolean) {
  if (value === undefined) {
    return 'Not set';
  }

  return value ? 'Enabled' : 'Disabled';
}

const enum ScopedInventoryRoute {
  Memberships = '/memberships',
  Invitations = '/memberships/invitations',
  Users = '/users'
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

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium leading-5 text-foreground">{value}</p>
    </div>
  );
}

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

function ProviderBadges({ detail }: { detail: AdminTenantDetail }) {
  if (detail.auth.providersInUse.length === 0) {
    return <p className="text-sm text-muted-foreground">No primary identity providers detected.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {detail.auth.providersInUse.map((provider) => (
        <Badge key={provider.provider} variant="outline" size="sm">
          {provider.provider}: {provider.count}
        </Badge>
      ))}
    </div>
  );
}

function MetadataRows({ metadata }: { metadata?: Record<string, unknown> }) {
  const entries = Object.entries(metadata ?? {});
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No metadata is available.</p>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <DetailField
          key={key}
          label={formatStatusLabel(key)}
          value={typeof value === 'string' ? value : JSON.stringify(value)}
        />
      ))}
    </div>
  );
}

async function loadTenantDetail(organizationId: number) {
  try {
    return await getAdminTenantDetail(organizationId);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}

function buildScopedAccessHref(basePath: ScopedInventoryRoute, detail: AdminTenantDetail) {
  const organizationKey =
    basePath === ScopedInventoryRoute.Memberships
      ? 'memberOrganizationId'
      : basePath === ScopedInventoryRoute.Invitations
        ? 'invitationOrganizationId'
        : undefined;
  const tenantKey =
    basePath === ScopedInventoryRoute.Memberships
      ? 'memberTenantId'
      : basePath === ScopedInventoryRoute.Invitations
        ? 'invitationTenantId'
        : 'userTenantId';
  const scopeLabelKey =
    basePath === ScopedInventoryRoute.Memberships
      ? 'memberScopeLabel'
      : basePath === ScopedInventoryRoute.Invitations
        ? 'invitationScopeLabel'
        : 'userScopeLabel';

  const params = new URLSearchParams({
    ...(organizationKey ? { [organizationKey]: String(detail.organizationId) } : {}),
    [tenantKey]: String(detail.tenantId),
    [scopeLabelKey]: detail.displayName ?? detail.name
  });

  return `${basePath}?${params.toString()}`;
}

export default async function TenantDetailPage({
  params
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const resolvedParams = await params;
  const organizationId = Number(resolvedParams.organizationId);

  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    notFound();
  }

  const detail = await loadTenantDetail(organizationId);
  const session = await getAdminSession();
  const canUpdateTenant = session?.user.permissions.includes('system:tenants:update') ?? false;
  const status = getStatusPresentation(detail.status);
  const onboarding = getOnboardingPresentation(detail.onboardingState);
  const OnboardingIcon = onboarding.icon;

  return (
    <AppPage className="space-y-5">
      <div className="space-y-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/tenants">Tenants</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-3.5 w-3.5" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>{detail.displayName ?? detail.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          title={detail.displayName ?? detail.name}
          badge="Organization"
          description="Inspect ownership, membership, auth posture, and tenant configuration without leaving the admin."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" size="sm" className={cn(status.className)}>
                {status.label}
              </Badge>
              <Badge
                variant="outline"
                size="sm"
                className={cn('flex items-center gap-1', onboarding.className)}
              >
                <OnboardingIcon className="h-3.5 w-3.5" />
                {onboarding.label}
              </Badge>
              <TenantLifecycleEditor
                tenantId={detail.tenantId}
                initialName={detail.name}
                initialSlug={detail.slug}
                currentStatus={detail.status}
                canUpdate={canUpdateTenant}
              />
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
                label="Members"
                value={formatNumber(detail.membership.totalMembers)}
                summary={`${formatNumber(detail.membership.activeMembers)} active, ${formatNumber(detail.membership.inactiveMembers)} inactive`}
              />
              <SummaryMetric
                icon={ShieldUser}
                label="Owners"
                value={formatNumber(detail.membership.ownerCount)}
                summary={`${formatNumber(detail.membership.adminCount)} admins, ${formatNumber(detail.membership.elevatedAccessCount)} elevated`}
              />
              <SummaryMetric
                icon={BellRing}
                label="Pending invites"
                value={formatNumber(
                  detail.invitationStatusCounts.find((item) => item.status === 'pending')?.count ??
                    0
                )}
                summary={`${formatNumber(detail.invitationStatusCounts.reduce((total, item) => total + item.count, 0))} total invitation records`}
              />
              <SummaryMetric
                icon={KeyRound}
                label="Auth"
                value={detail.auth.hasProvisionedAuthTenant ? 'Provisioned' : 'Not provisioned'}
                summary={detail.auth.authProvider ?? 'No auth provider reported'}
              />
            </div>
          </DetailCard>
        </aside>

        <div className="min-w-0 space-y-4">
          <DetailCard
            title="Organization profile"
            description="Core identifiers and lifecycle posture from the organization and tenant records."
          >
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <DetailField label="Name" value={detail.name} />
              <DetailField label="Display name" value={detail.displayName ?? 'Not set'} />
              <DetailField label="Slug" value={detail.slug} />
              <DetailField label="Organization ID" value={String(detail.organizationId)} />
              <DetailField label="Tenant ID" value={String(detail.tenantId)} />
              <DetailField label="Tenant type" value={formatTenantType(detail.tenantType)} />
              <DetailField label="Public ID" value={detail.publicId} />
              <DetailField label="Tenant public ID" value={detail.tenantPublicId} />
              <DetailField label="Created" value={formatTimestamp(detail.createdAt)} />
              <DetailField label="Updated" value={formatTimestamp(detail.updatedAt)} />
              <DetailField
                label="Deleted at"
                value={detail.deletedAt ? formatTimestamp(detail.deletedAt) : 'Not deleted'}
              />
              <DetailField
                label="Record posture"
                value={
                  detail.isDeleted ? 'Deleted' : detail.organizationActive ? 'Active' : 'Inactive'
                }
              />
            </div>
          </DetailCard>

          <div className="grid gap-4 2xl:grid-cols-2">
            <DetailCard
              title="Ownership and membership"
              description="Current owner assignment and aggregate membership posture."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailField
                  label="Designated owner"
                  value={detail.ownerDisplayName ?? 'No designated owner'}
                />
                <DetailField
                  label="Owner user ID"
                  value={detail.ownerUserId ? String(detail.ownerUserId) : 'Not assigned'}
                />
                <DetailField
                  label="Total members"
                  value={formatNumber(detail.membership.totalMembers)}
                />
                <DetailField
                  label="Active members"
                  value={formatNumber(detail.membership.activeMembers)}
                />
                <DetailField
                  label="Inactive members"
                  value={formatNumber(detail.membership.inactiveMembers)}
                />
                <DetailField label="Owners" value={formatNumber(detail.membership.ownerCount)} />
                <DetailField label="Admins" value={formatNumber(detail.membership.adminCount)} />
                <DetailField
                  label="Elevated access"
                  value={formatNumber(detail.membership.elevatedAccessCount)}
                />
              </div>
            </DetailCard>

            <DetailCard
              title="Auth posture"
              description="Provisioning state, feature posture, and detected identity providers."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailField
                  label="Auth provider"
                  value={detail.auth.authProvider ?? 'Not provisioned'}
                />
                <DetailField
                  label="GCP tenant ID"
                  value={detail.auth.gcpTenantId ?? 'Not provisioned'}
                />
                <DetailField
                  label="Provisioned tenant"
                  value={detail.auth.hasProvisionedAuthTenant ? 'Yes' : 'No'}
                />
                <DetailField label="SSO" value={formatBoolean(detail.auth.ssoEnabled)} />
                <DetailField
                  label="API access"
                  value={formatBoolean(detail.auth.apiAccessEnabled)}
                />
                <DetailField
                  label="Custom domain"
                  value={formatBoolean(detail.diagnostics.hasCustomDomain)}
                />
              </div>

              <div className="mt-3 space-y-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Providers in use
                </p>
                <ProviderBadges detail={detail} />
              </div>
            </DetailCard>
          </div>

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
            <DetailCard
              title="Owner records"
              description="Each current tenant owner membership with activity and identity posture."
            >
              {detail.owners.length === 0 ? (
                <p className="text-sm text-muted-foreground">No owner memberships are available.</p>
              ) : (
                <Table density="compact">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead className="pl-3">Owner</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Identity</TableHead>
                      <TableHead className="pr-3">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.owners.map((owner) => (
                      <TableRow key={owner.userId}>
                        <TableCell className="pl-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              {owner.displayName ?? `User ${owner.userId}`}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              User ID {owner.userId}
                              {owner.isDefault ? ' • Default membership' : ''}
                              {owner.isDesignatedOwner ? ' • Designated owner' : ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{formatStatusLabel(owner.membershipRole)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" size="sm">
                              {owner.isDeleted
                                ? 'Deleted'
                                : owner.isActive
                                  ? 'Active'
                                  : 'Needs attention'}
                            </Badge>
                            {owner.emailVerified !== undefined ? (
                              <Badge variant="outline" size="sm">
                                {owner.emailVerified ? 'Verified email' : 'Email unverified'}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{owner.primaryIdentityProvider ?? 'Not reported'}</TableCell>
                        <TableCell className="pr-3">{formatTimestamp(owner.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DetailCard>

            <DetailCard
              title="Invitation posture"
              description="Invitation status totals currently available from the admin API."
            >
              <div className="space-y-2">
                {detail.invitationStatusCounts.map((item) => (
                  <div
                    key={item.status}
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {formatStatusLabel(item.status)}
                    </span>
                    <Badge variant="outline" size="sm">
                      {formatNumber(item.count)}
                    </Badge>
                  </div>
                ))}
              </div>
            </DetailCard>
          </div>

          <div className="grid gap-4 2xl:grid-cols-2">
            <DetailCard
              title="Feature and diagnostic settings"
              description="Currently exposed controls and thresholds from tenant settings."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailField label="SSO" value={formatBoolean(detail.diagnostics.ssoEnabled)} />
                <DetailField
                  label="API access"
                  value={formatBoolean(detail.diagnostics.apiAccessEnabled)}
                />
                <DetailField
                  label="Custom domain"
                  value={formatBoolean(detail.diagnostics.hasCustomDomain)}
                />
                <DetailField
                  label="Custom email"
                  value={formatBoolean(detail.diagnostics.hasCustomEmail)}
                />
                <DetailField label="Max users" value={formatNumber(detail.diagnostics.maxUsers)} />
                <DetailField
                  label="API rate limit"
                  value={formatNumber(detail.diagnostics.apiRateLimit)}
                />
                <DetailField
                  label="Advanced analytics"
                  value={formatBoolean(detail.settings.features?.advancedAnalytics)}
                />
                <DetailField
                  label="Custom integrations"
                  value={formatBoolean(detail.settings.features?.customIntegrations)}
                />
                <DetailField
                  label="Audit log retention"
                  value={
                    detail.settings.features?.auditLogRetention !== undefined
                      ? `${formatNumber(detail.settings.features.auditLogRetention)} days`
                      : 'Not set'
                  }
                />
                <DetailField
                  label="Max projects"
                  value={formatNumber(detail.settings.features?.maxProjects)}
                />
              </div>
            </DetailCard>

            <DetailCard
              title="Branding, limits, and metadata"
              description="Additional tenant configuration values that are currently present."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailField label="Logo" value={detail.settings.branding?.logo ?? 'Not set'} />
                <DetailField
                  label="Primary color"
                  value={detail.settings.branding?.primaryColor ?? 'Not set'}
                />
                <DetailField
                  label="Custom domain"
                  value={detail.settings.branding?.customDomain ?? 'Not set'}
                />
                <DetailField
                  label="Custom email"
                  value={formatBoolean(detail.settings.branding?.customEmail)}
                />
                <DetailField
                  label="Monthly budget"
                  value={formatNumber(detail.settings.limits?.monthlyBudget)}
                />
                <DetailField
                  label="Storage quota"
                  value={formatNumber(detail.settings.limits?.storageQuota)}
                />
                <DetailField
                  label="API rate limit"
                  value={formatNumber(detail.settings.limits?.apiRateLimit)}
                />
              </div>

              <div className="mt-3 space-y-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Metadata
                </p>
                <MetadataRows metadata={detail.settings.metadata} />
              </div>
            </DetailCard>
          </div>

          <DetailCard
            title="Quick navigation"
            description="Jump back into the organization-scoped lists."
          >
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/system/emails?organizationId=${detail.organizationId}`}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
              >
                View emails
              </Link>
              <Link
                href={buildScopedAccessHref(ScopedInventoryRoute.Users, detail)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
              >
                View users
              </Link>
              <Link
                href={buildScopedAccessHref(ScopedInventoryRoute.Memberships, detail)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
              >
                View memberships
              </Link>
              <Link
                href={buildScopedAccessHref(ScopedInventoryRoute.Invitations, detail)}
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

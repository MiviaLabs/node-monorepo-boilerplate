import {
  BadgeCheck,
  BellRing,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  ShieldUser,
  UserRoundX,
  Users2
} from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import type {
  AdminAccessInvitation,
  AdminAccessMembership,
  AdminAccessMembershipStatus,
  AdminAccessMetric
} from '~/lib/admin';

import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export const AccessRoute = {
  Members: '/memberships',
  Invitations: '/memberships/invitations'
} as const;

export type AccessRoute = (typeof AccessRoute)[keyof typeof AccessRoute];

export const AccessSectionTab = {
  Members: 'memberships',
  Invitations: 'invitations'
} as const;

export type AccessSectionTab = (typeof AccessSectionTab)[keyof typeof AccessSectionTab];

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function getParam(params: SearchParamsRecord, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getMetricIcon(metricKey: string) {
  switch (metricKey) {
    case 'members_total':
      return Users2;
    case 'privileged_members_total':
      return ShieldUser;
    case 'active_invitations_total':
      return BellRing;
    case 'expired_or_cancelled_invitations_total':
      return KeyRound;
    default:
      return ShieldCheck;
  }
}

export function getMembershipStatusPresentation(
  status: AdminAccessMembershipStatus | 'deleted'
) {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        icon: BadgeCheck,
        className: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
      };
    case 'inactive':
      return {
        label: 'Inactive',
        icon: UserRoundX,
        className: 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300'
      };
    case 'suspended':
      return {
        label: 'Suspended',
        icon: ShieldAlert,
        className: 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300'
      };
    case 'deleted':
      return {
        label: 'Deleted',
        icon: UserRoundX,
        className: 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300'
      };
    default:
      return {
        label: 'Pending',
        icon: BellRing,
        className: 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300'
      };
  }
}

export function getInvitationStatusPresentation(status: AdminAccessInvitation['status']) {
  switch (status) {
    case 'pending':
      return 'border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300';
    case 'accepted':
      return 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
    case 'expired':
      return 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300';
  }
}

export function getRoleTone(role: string) {
  if (role === 'system_owner' || role === 'tenant_owner') {
    return 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300';
  }

  if (role === 'system_admin' || role === 'tenant_admin') {
    return 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300';
  }

  return 'border-border/70 bg-background/70 text-muted-foreground';
}

export function formatRoleLabel(role: string) {
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatSystemRoles(systemRoles: string[]) {
  if (systemRoles.length === 0) {
    return 'No system role';
  }

  return systemRoles.map(formatRoleLabel).join(' • ');
}

export function getDisplayName(member: AdminAccessMembership) {
  return member.displayName ?? `User ${member.userId}`;
}

export function buildAccessHref(
  basePath: AccessRoute,
  current: Record<string, string | number | undefined>,
  overrides: Record<string, string | number | undefined>
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value === undefined || value === '' || value === 'all') {
      continue;
    }

    if (
      (key === 'memberPage' && value === 1) ||
      (key === 'memberPageSize' && value === 20) ||
      (key === 'invitationPage' && value === 1) ||
      (key === 'invitationPageSize' && value === 10)
    ) {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

export const accessInputClassName =
  'h-8 w-full rounded-md border border-border/70 bg-background px-2.5 text-xs text-foreground shadow-xs shadow-black/5 outline-hidden transition-colors placeholder:text-muted-foreground/75 hover:border-border focus:border-foreground/20';

export const accessSelectClassName = accessInputClassName;

export const accessActionClassName =
  'inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background';

export const accessSecondaryActionClassName =
  'inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))] hover:text-foreground';

export function AccessWorkspace({
  children,
  rail
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)]">
      {rail ? <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">{rail}</aside> : null}
      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  );
}

export function AccessWorkspaceRail({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

export function AccessInsights({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] p-3">
      {title ? (
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </p>
      ) : null}
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

export function AccessSectionCardHeader({
  badge,
  title,
  description,
  action
}: {
  badge: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <CardHeader className="gap-2.5 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1.5">
        <Badge
          variant="secondary"
          size="sm"
          className="w-fit rounded-md uppercase tracking-[0.16em]"
        >
          {badge}
        </Badge>
        <div className="space-y-1">
          <CardTitle className="text-base tracking-[-0.02em]">{title}</CardTitle>
          <CardDescription className="max-w-2xl text-xs leading-5">{description}</CardDescription>
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </CardHeader>
  );
}

export function AccessFilterShell({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-xs shadow-black/5">
      <div className="mb-2.5 space-y-0.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </p>
        <p className="text-[11px] leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function AccessMetaRow({
  children,
  action
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2 text-[11px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      {action ? <div className="text-xs font-medium">{action}</div> : null}
    </div>
  );
}

const enum AccessContextChipTone {
  Default = 'default',
  Info = 'info'
}

export function AccessContextChip({
  children,
  tone = AccessContextChipTone.Default
}: {
  children: React.ReactNode;
  tone?: AccessContextChipTone;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium',
        tone === AccessContextChipTone.Info
          ? 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'
          : 'border-border/70 bg-background/70 text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}

export function AccessControlBar({
  children,
  title,
  summary,
  actions
}: {
  children: React.ReactNode;
  title?: string;
  summary?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-background px-3 py-3 shadow-xs shadow-black/5">
      {title || summary || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5">
            {title ? <p className="text-sm font-medium text-foreground">{title}</p> : null}
            {summary ? <div className="text-[11px] text-muted-foreground">{summary}</div> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function AccessControlGroup({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2 md:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>
  );
}

export function AccessPaginationSummary({
  page,
  totalPages
}: {
  page: number;
  totalPages: number;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
      Page {page}
      {totalPages > 0 ? ` of ${totalPages}` : ''}
    </div>
  );
}

export function AccessSectionNav({ active }: { active: AccessSectionTab }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-1">
      <Link
        href={AccessRoute.Members}
        className={cn(
          'inline-flex min-w-24 items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
          active === AccessSectionTab.Members
            ? 'border-foreground bg-foreground text-background shadow-xs shadow-black/10'
            : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background hover:text-foreground'
        )}
      >
        Memberships
      </Link>
      <Link
        href={AccessRoute.Invitations}
        className={cn(
          'inline-flex min-w-24 items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
          active === AccessSectionTab.Invitations
            ? 'border-foreground bg-foreground text-background shadow-xs shadow-black/10'
            : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background hover:text-foreground'
        )}
      >
        Invitations
      </Link>
    </div>
  );
}

export function AccessMetricCard({ metric }: { metric: AdminAccessMetric }) {
  const MetricIcon = getMetricIcon(metric.key);

  return (
    <Card className="premium-panel rounded-xl border-border/70 bg-background/85 shadow-xs shadow-black/5">
      <CardHeader className="px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardDescription className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
              {metric.label}
            </CardDescription>
            <CardTitle className="text-[1.35rem] tracking-tighter">{metric.value}</CardTitle>
          </div>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] text-muted-foreground">
            <MetricIcon className="h-3.5 w-3.5" />
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <p className="text-[11px] leading-5 text-muted-foreground">
          {metric.summary ?? 'Live access posture aggregate'}
        </p>
      </CardContent>
    </Card>
  );
}

export function AccessMetricsSummaryCard({
  title,
  metrics,
  footer
}: {
  title: string;
  metrics: AdminAccessMetric[];
  footer?: React.ReactNode;
}) {
  return (
    <Card className="premium-panel rounded-xl border-border/70 bg-background/85 shadow-xs shadow-black/5">
      <CardHeader className="px-3 py-3">
        <CardTitle className="text-sm tracking-[-0.02em]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3 pt-0">
        <div className="space-y-2">
          {metrics.map((metric) => {
            const MetricIcon = getMetricIcon(metric.key);

            return (
              <div
                key={metric.key}
                className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
                      {metric.label}
                    </p>
                    <p className="text-base font-semibold tracking-[-0.04em] text-foreground">
                      {metric.value}
                    </p>
                  </div>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground">
                    <MetricIcon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {metric.summary ?? 'Live access posture aggregate'}
                </p>
              </div>
            );
          })}
        </div>
        {footer ? <div className="border-t border-border/70 pt-3">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}

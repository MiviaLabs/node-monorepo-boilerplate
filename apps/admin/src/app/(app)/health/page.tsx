import {
  Activity,
  AlertTriangle,
  Database,
  FileWarning,
  CheckCircle2,
  CircleDashed,
  Building2,
  KeyRound,
  Layers3,
  Radar,
  ShieldAlert,
  Users2,
  XCircle
} from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import type { AdminHealthIncident, AdminHealthService } from '~/lib/admin';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '~/components/ui/table';
import { getAdminHealthOverview } from '~/lib/admin';
import { cn } from '~/lib/utils';

function getServiceIcon(serviceKey: AdminHealthService['key']) {
  switch (serviceKey) {
    case 'database':
      return Database;
    case 'redis':
      return Radar;
    case 'encryption':
      return KeyRound;
    case 'outbox':
      return Layers3;
    default:
      return Activity;
  }
}

function getMetricIcon(metricKey: string) {
  switch (metricKey) {
    case 'tenants_total':
      return Building2;
    case 'users_total':
      return Users2;
    case 'outbox_pending':
      return Layers3;
    case 'dead_letter_total':
      return FileWarning;
    default:
      return Activity;
  }
}

function getStatusPresentation(status: AdminHealthService['status']) {
  switch (status) {
    case 'ok':
      return {
        label: 'Healthy',
        icon: CheckCircle2,
        badgeClassName:
          'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
        iconClassName: 'text-emerald-600 dark:text-emerald-300',
        cardClassName: 'border-emerald-500/20 bg-emerald-500/5'
      };
    case 'degraded':
      return {
        label: 'Degraded',
        icon: AlertTriangle,
        badgeClassName: 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300',
        iconClassName: 'text-amber-600 dark:text-amber-300',
        cardClassName: 'border-amber-500/20 bg-amber-500/5'
      };
    case 'error':
      return {
        label: 'Critical',
        icon: XCircle,
        badgeClassName: 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300',
        iconClassName: 'text-rose-600 dark:text-rose-300',
        cardClassName: 'border-rose-500/20 bg-rose-500/5'
      };
    default:
      return {
        label: 'Unknown',
        icon: CircleDashed,
        badgeClassName: 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300',
        iconClassName: 'text-slate-500 dark:text-slate-300',
        cardClassName: 'border-slate-500/15 bg-slate-500/4'
      };
  }
}

function getIncidentPresentation(incident: Pick<AdminHealthIncident, 'priority' | 'state'>) {
  const priorityTone =
    incident.priority === 'high'
      ? 'border-rose-500/25 bg-rose-500/6'
      : incident.priority === 'medium'
        ? 'border-amber-500/25 bg-amber-500/6'
        : 'border-sky-500/25 bg-sky-500/6';

  const stateTone =
    incident.state === 'open'
      ? 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300'
      : incident.state === 'monitoring'
        ? 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300'
        : 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';

  return {
    containerClassName: priorityTone,
    stateClassName: stateTone
  };
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatIncidentState(state: AdminHealthIncident['state']) {
  if (state === 'open') return 'Open';
  if (state === 'resolved') return 'Resolved';
  return 'Monitoring';
}

export default async function HealthPage() {
  const overview = await getAdminHealthOverview();
  const overall = getStatusPresentation(overview.overallStatus);
  const OverallIcon = overall.icon;

  return (
    <AppPage className="space-y-6">
      <PageHeader
        title="Health"
        badge="System"
        description="Track service posture, incident signals, and the shared operational state behind the control plane."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/system/dead-letter"
              className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              Dead-letter queue
            </Link>
            <Link
              href="/system/event-replay"
              className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              Event replay
            </Link>
          </div>
        }
      />

      <Card
        className={cn(
          'premium-panel overflow-hidden rounded-lg border-border/70',
          overall.cardClassName
        )}
      >
        <CardContent className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-current/10 bg-background/70 p-2.5">
              <OverallIcon className={cn('h-5 w-5', overall.iconClassName)} />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Operational posture
                </p>
                <Badge
                  variant="outline"
                  className={cn('rounded-md px-2.5 py-1', overall.badgeClassName)}
                >
                  {overall.label}
                </Badge>
              </div>
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-foreground">
                {overview.incidents.length > 0
                  ? `${overview.incidents.length} incident signal${overview.incidents.length === 1 ? '' : 's'} require attention`
                  : 'All monitored admin services are within the healthy band'}
              </h2>
              <p className="text-sm text-muted-foreground">
                Last aggregate refresh {formatTimestamp(overview.generatedAt)}.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-72">
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Services
              </p>
              <p className="mt-1 text-lg font-semibold tracking-[-0.04em]">
                {overview.services.length}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Incidents
              </p>
              <p className="mt-1 text-lg font-semibold tracking-[-0.04em]">
                {overview.incidents.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {overview.metrics.map((metric) => {
          const MetricIcon = getMetricIcon(metric.key);

          return (
            <Card key={metric.key} className="premium-panel rounded-lg border-border/70">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardDescription>{metric.label}</CardDescription>
                    <CardTitle className="text-[1.5rem] tracking-tighter">{metric.value}</CardTitle>
                  </div>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] text-muted-foreground">
                    <MetricIcon className="h-4 w-4" />
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {metric.summary ? (
                  <p className="text-xs text-muted-foreground">{metric.summary}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Live admin health aggregate</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="border-b border-border/70 pb-4">
            <Badge
              variant="secondary"
              className="w-fit rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
            >
              Services
            </Badge>
            <CardTitle>Current service table</CardTitle>
            <CardDescription>
              Condensed health overview for the shared systems managed from admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-10 px-3">Service</TableHead>
                  <TableHead className="h-10 px-3">Status</TableHead>
                  <TableHead className="h-10 px-3">Summary</TableHead>
                  <TableHead className="h-10 px-3">Checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.services.map((service) => (
                  <TableRow key={service.key}>
                    <TableCell className="px-3 py-2.5 font-medium">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const ServiceIcon = getServiceIcon(service.key);

                          return (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-[hsl(var(--panel-subtle))] text-muted-foreground">
                              <ServiceIcon className="h-3 w-3" />
                            </span>
                          );
                        })()}
                        <span>{service.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      {(() => {
                        const presentation = getStatusPresentation(service.status);
                        const StatusIcon = presentation.icon;

                        return (
                          <Badge
                            variant="outline"
                            className={cn(
                              'rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em]',
                              presentation.badgeClassName
                            )}
                          >
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {presentation.label}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-muted-foreground">
                      <span>{service.summary ?? 'No additional notes'}</span>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                      {service.checkedAt ? (
                        <span>{formatTimestamp(service.checkedAt)}</span>
                      ) : (
                        'Not available'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="border-b border-border/70 pb-4">
            <Badge
              variant="secondary"
              className="w-fit rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
            >
              Incidents
            </Badge>
            <CardTitle>Recent incident queue</CardTitle>
            <CardDescription>
              Latest anomalies and review items across internal services.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4">
            {overview.incidents.length === 0 ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  <p className="text-sm font-medium text-foreground">No active incidents</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Dead-letter and dependency checks are currently clear.
                </p>
              </div>
            ) : (
              overview.incidents.map((item) => {
                const presentation = getIncidentPresentation(item);

                return (
                  <div
                    key={item.id}
                    className={cn('rounded-lg border px-3.5 py-3', presentation.containerClassName)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <ShieldAlert className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.summary}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            Priority {item.priority}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em]',
                          presentation.stateClassName
                        )}
                      >
                        {formatIncidentState(item.state)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Detected {formatTimestamp(item.occurredAt)}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </AppPage>
  );
}

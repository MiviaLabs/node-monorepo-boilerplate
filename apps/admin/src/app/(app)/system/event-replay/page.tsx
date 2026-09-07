import Link from 'next/link';
import React from 'react';

import type { AdminEventReplayStatus } from '~/lib/admin';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { EventReplayControls } from '~/components/admin/event-replay-controls';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { getAdminEventReplayStatus } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';
import { cn } from '~/lib/utils';

type SearchParamsRecord = Record<string, string | string[] | undefined>;

function getParam(params: SearchParamsRecord, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatTimestamp(value?: string) {
  if (!value) {
    return 'Not completed';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getStatusTone(status: AdminEventReplayStatus['status']) {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
    case 'failed':
      return 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300';
    case 'cancelled':
      return 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300';
    default:
      return 'border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300';
  }
}

function getCompletionRatio(status?: AdminEventReplayStatus) {
  if (!status || status.totalCount <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((status.processedCount / status.totalCount) * 100));
}

async function loadReplayStatus(replayId: string | undefined) {
  if (!replayId) {
    return { status: null, error: null as string | null };
  }

  try {
    return {
      status: await getAdminEventReplayStatus(replayId),
      error: null as string | null
    };
  } catch (error) {
    return {
      status: null,
      error:
        error instanceof Error ? error.message : `Replay session ${replayId} could not be loaded`
    };
  }
}

export default async function EventReplayPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const replayId = getParam(resolvedParams, 'replayId') ?? '';
  const session = await getAdminSession();
  const permissions = session?.user.permissions ?? [];
  const canViewReplay = permissions.includes('system:system:monitor');
  const canManageReplay = permissions.includes('system:system:settings');
  const replayLookup = canViewReplay
    ? await loadReplayStatus(replayId || undefined)
    : { status: null, error: null as string | null };
  const status = replayLookup.status;
  const replayLookupError = replayLookup.error;
  const completionRatio = getCompletionRatio(status ?? undefined);

  return (
    <AppPage className="space-y-7">
      <PageHeader
        title="Event replay"
        badge="System"
        description="Start, inspect, and cancel privileged replay sessions for recovery, debugging, and controlled reprocessing."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/system/dead-letter"
              className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              Open dead-letter queue
            </Link>
            {canViewReplay ? (
              <Link
                href={
                  replayId
                    ? `/system/event-replay?replayId=${encodeURIComponent(replayId)}`
                    : '/system/event-replay'
                }
                className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
              >
                Refresh status
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Replay session</CardDescription>
            <CardTitle className="text-[1.3rem] tracking-[-0.04em]">
              {status?.replayId ?? 'None selected'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Inspect a replay by ID or start a tenant-scoped replay from this surface.
            </p>
          </CardContent>
        </Card>
        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-[1.85rem] tracking-tighter">
              {status?.status ?? 'Idle'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Current execution state for the selected replay session.
            </p>
          </CardContent>
        </Card>
        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Processed</CardDescription>
            <CardTitle className="text-[1.85rem] tracking-tighter">
              {status ? `${status.processedCount}/${status.totalCount}` : '0/0'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              How many events have already been replayed from the current selection.
            </p>
          </CardContent>
        </Card>
        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Completion</CardDescription>
            <CardTitle className="text-[1.85rem] tracking-tighter">{completionRatio}%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Progress based on processed versus total queued replay events.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        <div className="space-y-4 xl:order-1">
          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="border-b border-border/70 pb-4">
              <Badge
                variant="secondary"
                className="w-fit rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
              >
                Workflow
              </Badge>
              <CardTitle>Replay control plane</CardTitle>
              <CardDescription>
                Start a tenant-scoped replay with bounded filters or inspect a known replay session
                by ID.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <EventReplayControls
                key={replayId || 'new-replay'}
                canViewReplay={canViewReplay}
                canManageReplay={canManageReplay}
                currentReplayId={replayId || undefined}
                status={status ?? undefined}
              />
            </CardContent>
          </Card>

          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="border-b border-border/70 pb-4">
              <Badge
                variant="secondary"
                className="w-fit rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
              >
                Session
              </Badge>
              <CardTitle>Replay status</CardTitle>
              <CardDescription>
                Current execution summary for the selected replay session.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Current state
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-md px-2.5 py-1',
                      getStatusTone(status?.status ?? 'running')
                    )}
                  >
                    {canViewReplay
                      ? (status?.status ?? 'No replay selected')
                      : 'Status unavailable'}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {canViewReplay
                    ? `Started ${status ? formatTimestamp(status.startedAt) : 'after a replay is selected'}.`
                    : 'Requires system monitoring permission to inspect replay sessions.'}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Completion
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {completionRatio}%
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Completed {status ? formatTimestamp(status.completedAt) : 'once the session ends'}
                  .
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Success count
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {status?.successCount ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Failure count
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {status?.failureCount ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3 sm:col-span-2">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Error
                </p>
                <p className="mt-2 text-sm text-foreground">
                  {replayLookupError ?? status?.error ?? 'No replay error reported.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:order-2">
          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="space-y-1.5 pb-3">
              <CardTitle className="text-sm tracking-[-0.02em]">Workflow links</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Use replay together with dead-letter triage and health monitoring.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
              <Link
                href="/system/dead-letter"
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 transition-colors hover:bg-[hsl(var(--panel-subtle))] hover:text-foreground"
              >
                <span>Dead-letter queue</span>
                <span className="font-medium text-foreground">Open</span>
              </Link>
              <Link
                href="/health"
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 transition-colors hover:bg-[hsl(var(--panel-subtle))] hover:text-foreground"
              >
                <span>Health surface</span>
                <span className="font-medium text-foreground">Open</span>
              </Link>
            </CardContent>
          </Card>

          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="space-y-1.5 pb-3">
              <CardTitle className="text-sm tracking-[-0.02em]">Guardrails</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Replay is privileged and cross-tenant by design. Keep runs scoped whenever possible.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs leading-5">
                Replay currently requires a tenant filter. Add aggregate, event-type, and date
                filters to keep each run tightly scoped.
              </div>
              {!canManageReplay ? (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
                  This operator can inspect replay status but cannot start or cancel replay sessions
                  without <code>system:system:settings</code>.
                </div>
              ) : null}
              {!canViewReplay ? (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
                  Replay creation is available, but status lookup requires{' '}
                  <code>system:system:monitor</code>.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppPage>
  );
}

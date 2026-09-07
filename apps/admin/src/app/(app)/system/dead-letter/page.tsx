import Link from 'next/link';
import React from 'react';

import type { AdminDeadLetterEvent } from '~/lib/admin';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { DeadLetterRowActions } from '~/components/admin/dead-letter-row-actions';
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
import { getAdminDeadLetterEvents } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';
import { cn } from '~/lib/utils';

type SearchParamsRecord = Record<string, string | string[] | undefined>;

function getParam(params: SearchParamsRecord, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function buildDeadLetterHref(
  current: Record<string, string | undefined>,
  overrides: Record<string, string | undefined>
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (!value || value === 'all') {
      continue;
    }

    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  return query.length > 0 ? `/system/dead-letter?${query}` : '/system/dead-letter';
}

function matchesSearch(item: AdminDeadLetterEvent, search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    item.eventId,
    item.eventType,
    item.aggregateId,
    item.tenantId ?? '',
    item.errorMessage,
    item.reason
  ].some((value) => value.toLowerCase().includes(normalized));
}

function getReasonTone(reason: AdminDeadLetterEvent['reason']) {
  switch (reason) {
    case 'permission':
      return 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300';
    case 'validation':
      return 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300';
    case 'timeout':
    case 'network':
      return 'border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300';
  }
}

export default async function DeadLetterPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const query = {
    search: getParam(resolvedParams, 'search') ?? '',
    eventType: getParam(resolvedParams, 'eventType') ?? '',
    reason: getParam(resolvedParams, 'reason') ?? 'all',
    tenantId: getParam(resolvedParams, 'tenantId') ?? ''
  };

  const [items, session] = await Promise.all([
    getAdminDeadLetterEvents(),
    getAdminSession()
  ]);
  const canManageDeadLetter = session?.user.permissions.includes('system:system:settings') ?? false;
  const filteredItems = items.filter((item) => {
    if (query.eventType && item.eventType !== query.eventType) {
      return false;
    }

    if (query.reason !== 'all' && item.reason !== query.reason) {
      return false;
    }

    if (query.tenantId && item.tenantId !== query.tenantId) {
      return false;
    }

    return matchesSearch(item, query.search);
  });

  const uniqueEventTypes = [...new Set(items.map((item) => item.eventType))].sort();
  const uniqueReasons = [...new Set(items.map((item) => item.reason))].sort();
  const uniqueTenants = [
    ...new Set(items.map((item) => item.tenantId).filter(Boolean))
  ].sort() as string[];
  const highestRetryCount = filteredItems.reduce((max, item) => Math.max(max, item.retryCount), 0);
  const resetHref = buildDeadLetterHref(query, {
    search: undefined,
    eventType: undefined,
    reason: undefined,
    tenantId: undefined
  });

  return (
    <AppPage className="space-y-7">
      <PageHeader
        title="Dead-letter queue"
        badge="System"
        description="Review permanently failed events and take replay or cleanup action from one protected operator surface."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/system/outbox"
              className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              Back to outbox
            </Link>
            <Link
              href="/system/event-replay"
              className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              Open event replay
            </Link>
            <Link
              href="/health"
              className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              Open health
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Total queue</CardDescription>
            <CardTitle className="text-[1.85rem] tracking-tighter">{items.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              All dead-lettered events visible to the operator.
            </p>
          </CardContent>
        </Card>
        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Matched events</CardDescription>
            <CardTitle className="text-[1.85rem] tracking-tighter">
              {filteredItems.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Current search and filter result set.</p>
          </CardContent>
        </Card>
        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Tenants impacted</CardDescription>
            <CardTitle className="text-[1.85rem] tracking-tighter">
              {new Set(filteredItems.map((item) => item.tenantId).filter(Boolean)).size}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Distinct tenant scopes represented in the current queue.
            </p>
          </CardContent>
        </Card>
        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Highest retry count</CardDescription>
            <CardTitle className="text-[1.85rem] tracking-tighter">{highestRetryCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Largest retry history among currently matched events.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        <Card className="premium-panel rounded-xl border-border/70 xl:order-1">
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-col gap-3 border-b border-border/70 pb-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    Replay candidates
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Failed events that exceeded retry posture and now need operator intervention.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{filteredItems.length} matched records</span>
                  <span className="text-border">•</span>
                  <span>{uniqueReasons.length} reasons in queue</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {query.search ? (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="border-border/70 bg-background/70 text-muted-foreground"
                  >
                    Search: {query.search}
                  </Badge>
                ) : null}
                {query.eventType ? (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="border-border/70 bg-background/70 text-muted-foreground"
                  >
                    Event: {query.eventType}
                  </Badge>
                ) : null}
                {query.reason !== 'all' ? (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="border-border/70 bg-background/70 text-muted-foreground"
                  >
                    Reason: {query.reason}
                  </Badge>
                ) : null}
                {query.tenantId ? (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="border-border/70 bg-background/70 text-muted-foreground"
                  >
                    Tenant: {query.tenantId}
                  </Badge>
                ) : null}
                {query.search || query.eventType || query.reason !== 'all' || query.tenantId ? (
                  <Link
                    href={resetHref}
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Reset queue
                  </Link>
                ) : null}
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">No dead-lettered events</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The current queue is clear, or your filters do not match any failed events.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/70 bg-background/80">
                <Table density="compact">
                  <TableHeader>
                    <TableRow className="bg-[hsl(var(--panel-subtle))]">
                      <TableHead className="px-4">Event</TableHead>
                      <TableHead className="px-4">Scope</TableHead>
                      <TableHead className="px-4">Failure</TableHead>
                      <TableHead className="px-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.eventId}>
                        <TableCell className="align-top px-4">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-foreground">{item.eventType}</p>
                              <Badge
                                variant="outline"
                                size="sm"
                                className={cn('border', getReasonTone(item.reason))}
                              >
                                {item.reason}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{item.aggregateId}</p>
                            <p className="text-xs text-muted-foreground">Event {item.eventId}</p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top px-4 text-sm text-muted-foreground">
                          <div className="space-y-1">
                            <p>{item.tenantId ? `Tenant ${item.tenantId}` : 'System scope'}</p>
                            <p className="text-xs">{formatTimestamp(item.deadLetteredAt)}</p>
                            <p className="text-xs">{item.retryCount} retries before dead-letter</p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top px-4 text-sm text-muted-foreground">
                          <p>{item.errorMessage}</p>
                        </TableCell>
                        <TableCell className="align-top px-4">
                          {canManageDeadLetter ? (
                            <DeadLetterRowActions
                              eventId={item.eventId}
                              eventType={item.eventType}
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Requires system settings permission
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 xl:order-2">
          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="space-y-1.5 pb-3">
              <CardTitle className="text-sm tracking-[-0.02em]">Filter shortcuts</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Fast queue pivots based on the live dead-letter payload returned by the API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
              {uniqueEventTypes.slice(0, 5).map((eventType) => (
                <Link
                  key={eventType}
                  href={buildDeadLetterHref(query, {
                    eventType,
                    reason: undefined,
                    tenantId: undefined
                  })}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 transition-colors hover:bg-[hsl(var(--panel-subtle))] hover:text-foreground"
                >
                  <span className="truncate">{eventType}</span>
                  <span className="font-medium text-foreground">
                    {items.filter((item) => item.eventType === eventType).length}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="space-y-1.5 pb-3">
              <CardTitle className="text-sm tracking-[-0.02em]">Operator guidance</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Replay after the underlying failure is fixed. Delete only when the record is no
                longer needed for recovery or analysis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Reasons represented</span>
                <span className="font-medium text-foreground">{uniqueReasons.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Tenant scopes represented</span>
                <span className="font-medium text-foreground">{uniqueTenants.length}</span>
              </div>
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                Use search to match event IDs, aggregate IDs, tenant IDs, reasons, or failure text.
                Replay leaves an audit trail in the API layer.
              </div>
              {!canManageDeadLetter ? (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
                  This operator can review the dead-letter queue but cannot replay or delete events
                  without <code>system:system:settings</code>.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppPage>
  );
}

import Link from 'next/link';
import React from 'react';

import type { AdminOutboxItem, AdminOutboxStatus } from '~/lib/admin';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
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
import { getAdminOutboxOverview } from '~/lib/admin';
import { cn } from '~/lib/utils';

type SearchParamsRecord = Record<string, string | string[] | undefined>;

function getParam(params: SearchParamsRecord, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatRelativeAge(ageSeconds: number) {
  if (ageSeconds < 60) {
    return `${ageSeconds}s`;
  }

  if (ageSeconds < 3600) {
    return `${Math.floor(ageSeconds / 60)}m`;
  }

  if (ageSeconds < 86400) {
    return `${Math.floor(ageSeconds / 3600)}h`;
  }

  return `${Math.floor(ageSeconds / 86400)}d`;
}

function buildOutboxHref(
  current: Record<string, string | number | undefined>,
  overrides: Record<string, string | number | undefined>
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value === undefined || value === '' || value === 'all') {
      continue;
    }

    if ((key === 'page' && value === 1) || (key === 'pageSize' && value === 20)) {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query.length > 0 ? `/system/outbox?${query}` : '/system/outbox';
}

function getStatusTone(status: AdminOutboxStatus) {
  switch (status) {
    case 'failed':
      return 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300';
    case 'processing':
      return 'border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300';
    case 'published':
      return 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300';
  }
}

function formatStatus(status: AdminOutboxStatus) {
  return status.replace(/_/g, ' ');
}

function QueueTableRow({ item }: { item: AdminOutboxItem }) {
  return (
    <TableRow>
      <TableCell className="align-top px-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{item.eventType}</p>
            <Badge variant="outline" size="sm" className={cn('border', getStatusTone(item.status))}>
              {formatStatus(item.status)}
            </Badge>
            {item.isDeadLettered ? (
              <Badge
                variant="outline"
                size="sm"
                className="border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300"
              >
                dead-lettered
              </Badge>
            ) : null}
            {item.isRetryable ? (
              <Badge
                variant="outline"
                size="sm"
                className="border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300"
              >
                retryable
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{item.aggregateId}</p>
          <p className="text-xs text-muted-foreground">Tenant {item.tenantId}</p>
          <p className="text-xs text-muted-foreground">Event {item.eventId}</p>
        </div>
      </TableCell>
      <TableCell className="align-top px-4 text-sm text-muted-foreground">
        <div className="space-y-1">
          <p>{formatTimestamp(item.createdAt)}</p>
          <p className="text-xs">Age {formatRelativeAge(item.ageSeconds)}</p>
          {item.publishedAt ? (
            <p className="text-xs">Published {formatTimestamp(item.publishedAt)}</p>
          ) : null}
          {item.lastRetryAt ? (
            <p className="text-xs">Last retry {formatTimestamp(item.lastRetryAt)}</p>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="align-top px-4 text-sm text-muted-foreground">
        <div className="space-y-1">
          <p>{item.retryCount} retries</p>
          <p className="text-xs">
            {item.nextRetryAt
              ? `Next retry ${formatTimestamp(item.nextRetryAt)}`
              : 'No retry scheduled'}
          </p>
          {item.deadLetteredAt ? (
            <p className="text-xs">Dead-lettered {formatTimestamp(item.deadLetteredAt)}</p>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="align-top px-4 text-sm text-muted-foreground">
        <div className="space-y-1">
          <p>{item.errorSummary ? item.errorSummary : 'No error recorded'}</p>
          {item.deadLetterReason ? (
            <p className="text-xs">Reason: {item.deadLetterReason}</p>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="align-top px-4 text-sm text-muted-foreground">
        <details className="group max-w-[24rem]">
          <summary className="cursor-pointer list-none text-sm font-medium text-foreground underline-offset-4 group-open:mb-2 group-open:underline">
            View details
          </summary>
          <div className="space-y-2 rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3">
            <div className="space-y-1 text-xs">
              {item.correlationId ? <p>Correlation: {item.correlationId}</p> : null}
              {item.causationId ? <p>Causation: {item.causationId}</p> : null}
              {item.payloadSizeBytes !== undefined ? (
                <p>Payload size: {item.payloadSizeBytes} bytes</p>
              ) : null}
              {item.payloadKeys && item.payloadKeys.length > 0 ? (
                <p>Payload keys: {item.payloadKeys.join(', ')}</p>
              ) : (
                <p>Payload body hidden from monitor view</p>
              )}
            </div>
          </div>
        </details>
      </TableCell>
    </TableRow>
  );
}

export default async function OutboxPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const query = {
    page: parsePositiveInt(getParam(resolvedParams, 'page'), 1),
    pageSize: parsePositiveInt(getParam(resolvedParams, 'pageSize'), 20),
    search: getParam(resolvedParams, 'search') ?? '',
    status: getParam(resolvedParams, 'status') ?? 'all',
    deadLetterState: getParam(resolvedParams, 'deadLetterState') ?? 'all',
    retryState: getParam(resolvedParams, 'retryState') ?? 'all',
    eventType: getParam(resolvedParams, 'eventType') ?? '',
    aggregateId: getParam(resolvedParams, 'aggregateId') ?? '',
    filterTenantId: getParam(resolvedParams, 'filterTenantId') ?? '',
    sortBy: getParam(resolvedParams, 'sortBy') ?? 'createdAt',
    sortOrder: getParam(resolvedParams, 'sortOrder') ?? 'desc'
  };

  const overview = await getAdminOutboxOverview({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search || undefined,
    status: query.status !== 'all' ? query.status : undefined,
    deadLetterState: query.deadLetterState !== 'all' ? query.deadLetterState : undefined,
    retryState: query.retryState !== 'all' ? query.retryState : undefined,
    eventType: query.eventType || undefined,
    aggregateId: query.aggregateId || undefined,
    filterTenantId: query.filterTenantId || undefined,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder
  });

  const activeFilters = [
    query.search ? `Search: ${query.search}` : null,
    query.status !== 'all' ? `Status: ${query.status.replace(/_/g, ' ')}` : null,
    query.deadLetterState !== 'all'
      ? `Dead letter: ${query.deadLetterState.replace(/_/g, ' ')}`
      : null,
    query.retryState !== 'all' ? `Retry: ${query.retryState.replace(/_/g, ' ')}` : null,
    query.eventType ? `Event: ${query.eventType}` : null,
    query.aggregateId ? `Aggregate: ${query.aggregateId}` : null,
    query.filterTenantId ? `Tenant: ${query.filterTenantId}` : null
  ].filter(Boolean) as string[];

  const resetHref = buildOutboxHref(query, {
    page: 1,
    pageSize: 20,
    search: undefined,
    status: undefined,
    deadLetterState: undefined,
    retryState: undefined,
    eventType: undefined,
    aggregateId: undefined,
    filterTenantId: undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });

  return (
    <AppPage className="space-y-7">
      <PageHeader
        title="Outbox monitor"
        badge="System"
        description="Inspect persisted outbox deliveries that are pending, retrying, processing, or dead-lettered."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/statistics"
              className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              Back to statistics
            </Link>
            <Link
              href="/system/dead-letter"
              className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              Open dead-letter queue
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overview.metrics.map((item) => (
          <Card key={item.key} className="premium-panel rounded-xl border-border/70">
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-[1.85rem] tracking-tighter">{item.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{item.summary}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        <Card className="premium-panel rounded-xl border-border/70 xl:order-1">
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-col gap-3 border-b border-border/70 pb-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    Delivery backlog
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Read-only queue view for persisted outbox records, including queued, failed, and
                    published deliveries.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{overview.pagination.total} queued records</span>
                  <span className="text-border">•</span>
                  <span>{overview.summary.retryable} retryable now</span>
                  <span className="text-border">•</span>
                  <span>{overview.summary.deadLettered} dead-lettered</span>
                  <span className="text-border">•</span>
                  <span>Generated {formatTimestamp(overview.generatedAt)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeFilters.map((filter) => (
                  <Badge
                    key={filter}
                    variant="outline"
                    size="sm"
                    className="border-border/70 bg-background/70 text-muted-foreground"
                  >
                    {filter}
                  </Badge>
                ))}
                {activeFilters.length > 0 ? (
                  <Link
                    href={resetHref}
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Reset queue
                  </Link>
                ) : null}
              </div>
            </div>

            {overview.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">No queued outbox records</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The current filters do not match any persisted delivery items.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background/80">
                  <Table density="compact">
                    <TableHeader>
                      <TableRow className="bg-[hsl(var(--panel-subtle))]">
                        <TableHead className="px-4">Event</TableHead>
                        <TableHead className="px-4">Timing</TableHead>
                        <TableHead className="px-4">Retries</TableHead>
                        <TableHead className="px-4">Failure</TableHead>
                        <TableHead className="px-4">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.items.map((item) => (
                        <QueueTableRow key={item.eventId} item={item} />
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {overview.pagination.totalPages > 1 ? (
                  <Pagination className="justify-end">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href={
                            overview.pagination.hasPrevious
                              ? buildOutboxHref(query, { page: query.page - 1 })
                              : undefined
                          }
                          aria-disabled={!overview.pagination.hasPrevious}
                        />
                      </PaginationItem>
                      {Array.from(
                        { length: overview.pagination.totalPages },
                        (_, index) => index + 1
                      )
                        .slice(
                          Math.max(0, query.page - 2),
                          Math.min(overview.pagination.totalPages, query.page + 1)
                        )
                        .map((pageNumber) => (
                          <PaginationItem key={pageNumber}>
                            <PaginationLink
                              href={buildOutboxHref(query, { page: pageNumber })}
                              isActive={pageNumber === query.page}
                            >
                              {pageNumber}
                            </PaginationLink>
                          </PaginationItem>
                        ))}
                      <PaginationItem>
                        <PaginationNext
                          href={
                            overview.pagination.hasNext
                              ? buildOutboxHref(query, { page: query.page + 1 })
                              : undefined
                          }
                          aria-disabled={!overview.pagination.hasNext}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 xl:order-2">
          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="space-y-1.5 pb-3">
              <CardTitle className="text-sm tracking-[-0.02em]">Queue posture</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Snapshot of the current retry and failure pressure across persisted deliveries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Pending</span>
                <span className="font-medium text-foreground">{overview.summary.pending}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Processing</span>
                <span className="font-medium text-foreground">{overview.summary.processing}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Retryable</span>
                <span className="font-medium text-foreground">{overview.summary.retryable}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Dead-lettered</span>
                <span className="font-medium text-foreground">{overview.summary.deadLettered}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="space-y-1.5 pb-3">
              <CardTitle className="text-sm tracking-[-0.02em]">Delivery details</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Focus the queue with filters, then open event details to inspect payload and retry
                metadata and retry lineage without mutating anything.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Total matched</span>
                <span className="font-medium text-foreground">{overview.summary.total}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Published</span>
                <span className="font-medium text-foreground">{overview.summary.published}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Failed</span>
                <span className="font-medium text-foreground">{overview.summary.failed}</span>
              </div>
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                Use filters for status, retry posture, dead-letter state, tenant, aggregate, or text
                search. Each row exposes correlation IDs and payload details inline.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppPage>
  );
}

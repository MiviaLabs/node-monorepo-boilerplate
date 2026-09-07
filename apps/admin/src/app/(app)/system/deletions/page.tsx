import Link from 'next/link';
import React from 'react';

import type {
  AdminDeletionEntityType,
  AdminDeletionProviderCleanupState,
  AdminDeletionQueueItem
} from '~/lib/admin';

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
import { getAdminDeletionQueueOverview } from '~/lib/admin';
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

function buildDeletionQueueHref(
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
  return query.length > 0 ? `/system/deletions?${query}` : '/system/deletions';
}

function getEntityLabel(entityType: AdminDeletionEntityType) {
  return entityType === 'organization' ? 'Organization' : 'User';
}

function getProviderStateTone(state: AdminDeletionProviderCleanupState) {
  switch (state) {
    case 'pending':
      return 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300';
    case 'unknown':
      return 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300';
    default:
      return 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
  }
}

function getDaysRemainingPresentation(item: AdminDeletionQueueItem) {
  if (item.isOverdue || item.daysUntilPurge < 0) {
    return {
      label: `${Math.abs(item.daysUntilPurge)}d overdue`,
      className: 'text-rose-700 dark:text-rose-300'
    };
  }

  if (item.daysUntilPurge <= 7) {
    return {
      label: `${item.daysUntilPurge}d left`,
      className: 'text-amber-700 dark:text-amber-300'
    };
  }

  return {
    label: `${item.daysUntilPurge}d left`,
    className: 'text-muted-foreground'
  };
}

function QueueTableRow({ item }: { item: AdminDeletionQueueItem }) {
  const daysRemaining = getDaysRemainingPresentation(item);

  return (
    <TableRow>
      <TableCell className="align-top px-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{item.displayLabel}</p>
            <Badge variant="outline" size="sm" className="border-border/70 bg-background/70">
              {getEntityLabel(item.entityType)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {item.secondaryLabel ?? `Record ${item.entityId}`}
          </p>
        </div>
      </TableCell>
      <TableCell className="align-top px-4 text-sm text-muted-foreground">
        {formatTimestamp(item.deletedAt)}
      </TableCell>
      <TableCell className="align-top px-4 text-sm text-muted-foreground">
        <div className="space-y-1">
          <p>{formatTimestamp(item.purgeDueAt)}</p>
          <p className={cn('text-xs font-medium', daysRemaining.className)}>
            {daysRemaining.label}
          </p>
        </div>
      </TableCell>
      <TableCell className="align-top px-4">
        <Badge
          variant="outline"
          size="sm"
          className={cn('border', getProviderStateTone(item.providerCleanupState))}
        >
          {item.providerCleanupState.replace('_', ' ')}
        </Badge>
        {item.providerContext ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{item.providerContext}</p>
        ) : null}
      </TableCell>
      <TableCell className="align-top px-4">
        {item.detailHref ? (
          <Link
            href={item.detailHref}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Open detail
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">No linked detail</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default async function DeletionsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const query = {
    page: parsePositiveInt(getParam(resolvedParams, 'page'), 1),
    pageSize: parsePositiveInt(getParam(resolvedParams, 'pageSize'), 20),
    entityType: getParam(resolvedParams, 'entityType') ?? 'all',
    purgeState: getParam(resolvedParams, 'purgeState') ?? 'all',
    providerState: getParam(resolvedParams, 'providerState') ?? 'all',
    sortBy: getParam(resolvedParams, 'sortBy') ?? 'scheduledPurgeAt',
    sortOrder: getParam(resolvedParams, 'sortOrder') ?? 'asc'
  };

  const overview = await getAdminDeletionQueueOverview({
    page: query.page,
    pageSize: query.pageSize,
    entityType: query.entityType !== 'all' ? query.entityType : undefined,
    purgeState: query.purgeState !== 'all' ? query.purgeState : undefined,
    providerState: query.providerState !== 'all' ? query.providerState : undefined,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder
  });

  const activeFilters = [
    query.entityType !== 'all' ? `Entity: ${query.entityType}` : null,
    query.purgeState !== 'all' ? `Window: ${query.purgeState.replace(/_/g, ' ')}` : null,
    query.providerState !== 'all' ? `Provider: ${query.providerState.replace(/_/g, ' ')}` : null
  ].filter(Boolean) as string[];

  const resetHref = buildDeletionQueueHref(query, {
    page: 1,
    pageSize: 20,
    entityType: undefined,
    purgeState: undefined,
    providerState: undefined,
    sortBy: 'scheduledPurgeAt',
    sortOrder: 'asc'
  });

  return (
    <AppPage className="space-y-7">
      <PageHeader
        title="Deletion queue"
        badge="Retention"
        description="Review soft-deleted users and organizations waiting for permanent purge and provider cleanup."
        actions={
          <Link
            href="/statistics"
            className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
          >
            Back to statistics
          </Link>
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
                    Pending deletions
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Unified queue for records already soft-deleted and waiting for purge.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{overview.pagination.total} queued records</span>
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
                <p className="text-sm font-medium text-foreground">No pending deletions</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The current filters do not match any queued records.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background/80">
                  <Table density="compact">
                    <TableHeader>
                      <TableRow className="bg-[hsl(var(--panel-subtle))]">
                        <TableHead className="px-4">Record</TableHead>
                        <TableHead className="px-4">Deleted at</TableHead>
                        <TableHead className="px-4">Purge due</TableHead>
                        <TableHead className="px-4">Provider cleanup</TableHead>
                        <TableHead className="px-4">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.items.map((item) => (
                        <QueueTableRow key={`${item.entityType}-${item.entityId}`} item={item} />
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
                              ? buildDeletionQueueHref(query, { page: query.page - 1 })
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
                              href={buildDeletionQueueHref(query, { page: pageNumber })}
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
                              ? buildDeletionQueueHref(query, { page: query.page + 1 })
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
              <CardTitle className="text-sm tracking-[-0.02em]">Purge policy</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Current scheduler posture for the always-on soft-delete purge process.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Retention window</span>
                <span className="font-medium text-foreground">{overview.retentionDays} days</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Purge cron</span>
                <span className="font-medium text-foreground">{overview.purgeCron}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Dry run</span>
                <span className="font-medium text-foreground">
                  {overview.dryRun ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="space-y-1.5 pb-3">
              <CardTitle className="text-sm tracking-[-0.02em]">Age buckets</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Distribution by time already spent waiting in the retention backlog.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {overview.ageBuckets.map((bucket) => (
                <div
                  key={bucket.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{bucket.label}</span>
                  <span className="font-medium text-foreground">{bucket.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppPage>
  );
}

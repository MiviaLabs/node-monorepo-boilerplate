import Link from 'next/link';
import React from 'react';

import type { AdminEmailItem } from '~/lib/admin';

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
import { getAdminEmailsOverview } from '~/lib/admin';
import { cn } from '~/lib/utils';

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type EmailsQueryState = {
  page: number;
  pageSize: number;
  search: string;
  organizationId: string;
  messageStatus: string;
  provider: string;
  providerStatus: string;
  normalizedProviderStatus: string;
  referenceType: string;
  referenceId: string;
  webhookAttentionState: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  sortOrder: string;
};

function getParam(params: SearchParamsRecord, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function buildEmailsHref(
  current: Record<string, string | number | undefined>,
  overrides: Record<string, string | number | undefined>
): string {
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
  return query.length > 0 ? `/system/emails?${query}` : '/system/emails';
}

function buildEmailWebhooksHref(
  current: Record<string, string | number | undefined>,
  overrides: Record<string, string | number | undefined>
): string {
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
  return query.length > 0 ? `/system/email-webhooks?${query}` : '/system/email-webhooks';
}

function getMessageTone(status: string): string {
  switch (status) {
    case 'delivered':
      return 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
    case 'accepted':
      return 'border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300';
    case 'failed':
    case 'bounced':
    case 'complained':
      return 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300';
  }
}

function buildWebhookInvestigationHref(item: AdminEmailItem): string {
  return buildEmailWebhooksHref(
    {},
    {
      provider: item.provider,
      organizationId: item.organizationId,
      emailMessageId: item.emailMessageId,
      providerMessageId: item.providerMessageId,
      providerDeliveryId: item.providerDeliveryId,
      providerEventId: item.providerEventId
    }
  );
}

function buildEmailActiveFilters(query: EmailsQueryState): string[] {
  return [
    query.search ? `Search: ${query.search}` : null,
    query.organizationId ? `Organization: ${query.organizationId}` : null,
    query.messageStatus !== 'all' ? `Status: ${query.messageStatus}` : null,
    query.provider ? `Provider: ${query.provider}` : null,
    query.providerStatus ? `Provider status: ${query.providerStatus}` : null,
    query.normalizedProviderStatus
      ? `Normalized provider status: ${query.normalizedProviderStatus}`
      : null,
    query.referenceType ? `Reference type: ${query.referenceType}` : null,
    query.referenceId ? `Reference id: ${query.referenceId}` : null,
    query.webhookAttentionState !== 'all'
      ? `Webhook attention: ${query.webhookAttentionState}`
      : null,
    query.dateFrom ? `From: ${query.dateFrom}` : null,
    query.dateTo ? `To: ${query.dateTo}` : null
  ].filter(Boolean) as string[];
}

function buildEmailResetHref(query: EmailsQueryState): string {
  return buildEmailsHref(query, {
    page: 1,
    pageSize: 20,
    search: undefined,
    organizationId: undefined,
    messageStatus: undefined,
    provider: undefined,
    providerStatus: undefined,
    normalizedProviderStatus: undefined,
    referenceType: undefined,
    referenceId: undefined,
    webhookAttentionState: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });
}

function parseEmailsQuery(params: SearchParamsRecord): EmailsQueryState {
  return {
    page: parsePositiveInt(getParam(params, 'page'), 1),
    pageSize: parsePositiveInt(getParam(params, 'pageSize'), 20),
    search: getParam(params, 'search') ?? '',
    organizationId: getParam(params, 'organizationId') ?? '',
    messageStatus: getParam(params, 'messageStatus') ?? 'all',
    provider: getParam(params, 'provider') ?? '',
    providerStatus: getParam(params, 'providerStatus') ?? '',
    normalizedProviderStatus: getParam(params, 'normalizedProviderStatus') ?? '',
    referenceType: getParam(params, 'referenceType') ?? '',
    referenceId: getParam(params, 'referenceId') ?? '',
    webhookAttentionState: getParam(params, 'webhookAttentionState') ?? 'all',
    dateFrom: getParam(params, 'dateFrom') ?? '',
    dateTo: getParam(params, 'dateTo') ?? '',
    sortBy: getParam(params, 'sortBy') ?? 'createdAt',
    sortOrder: getParam(params, 'sortOrder') ?? 'desc'
  };
}

function EmailMessageCell({ item }: { item: AdminEmailItem }) {
  return (
    <TableCell className="align-top px-4">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">
            {item.subject ?? item.referenceId ?? item.publicId}
          </p>
          <Badge
            variant="outline"
            size="sm"
            className={cn('border', getMessageTone(item.messageStatus))}
          >
            {item.messageStatus}
          </Badge>
          {item.webhookAttentionState === 'attention' ? (
            <Badge
              variant="outline"
              size="sm"
              className="border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300"
            >
              webhook attention
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {item.referenceType ?? 'email'} {item.referenceId ? `• ${item.referenceId}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link
            href={`/tenants/${item.organizationId}`}
            className="underline-offset-4 hover:underline"
          >
            {item.organizationName}
          </Link>
          <span>Org {item.organizationId}</span>
          <span>Message {item.emailMessageId}</span>
        </div>
      </div>
    </TableCell>
  );
}

function EmailProviderCell({ item }: { item: AdminEmailItem }) {
  return (
    <TableCell className="align-top px-4 text-sm text-muted-foreground">
      <div className="space-y-1">
        <p>{item.provider ?? 'No provider attempt yet'}</p>
        <p className="text-xs">Attempt {item.attemptNumber ?? 0}</p>
        <p className="text-xs">{item.providerStatus ?? 'No provider status'}</p>
        <p className="text-xs">
          {item.normalizedProviderStatus ?? 'No normalized provider status'}
        </p>
      </div>
    </TableCell>
  );
}

function EmailTimingCell({ item }: { item: AdminEmailItem }) {
  return (
    <TableCell className="align-top px-4 text-sm text-muted-foreground">
      <div className="space-y-1">
        <p>Accepted {formatTimestamp(item.acceptedAt)}</p>
        <p>Delivered {formatTimestamp(item.deliveredAt)}</p>
        <p>Failed {formatTimestamp(item.failedAt)}</p>
        <p>Webhook {formatTimestamp(item.lastWebhookAt)}</p>
      </div>
    </TableCell>
  );
}

function EmailWebhookCell({ item }: { item: AdminEmailItem }) {
  return (
    <TableCell className="align-top px-4 text-sm text-muted-foreground">
      <div className="space-y-1">
        <p>Last webhook status {item.latestWebhookProcessingStatus ?? 'Not available'}</p>
        <p className="text-xs">Failed webhooks {item.failedWebhookCount}</p>
        <p className="text-xs">Unmatched webhooks {item.unmatchedWebhookCount}</p>
        <Link
          href={buildWebhookInvestigationHref(item)}
          className="text-xs font-medium underline-offset-4 hover:underline"
        >
          Open webhook investigation
        </Link>
      </div>
    </TableCell>
  );
}

function EmailDetailsCell({
  item,
  currentQuery
}: {
  item: AdminEmailItem;
  currentQuery: EmailsQueryState;
}) {
  return (
    <TableCell className="align-top px-4 text-sm text-muted-foreground">
      <details className="group max-w-[24rem]">
        <summary className="cursor-pointer list-none text-sm font-medium text-foreground underline-offset-4 group-open:mb-2 group-open:underline">
          View details
        </summary>
        <div className="space-y-2 rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3 text-xs">
          {item.providerMessageId ? <p>Provider message: {item.providerMessageId}</p> : null}
          {item.providerDeliveryId ? <p>Delivery ID: {item.providerDeliveryId}</p> : null}
          {item.providerEventId ? <p>Event ID: {item.providerEventId}</p> : null}
          {item.correlationId ? <p>Correlation: {item.correlationId}</p> : null}
          {item.safeMetadataSummary?.templateKey ? (
            <p>Template: {item.safeMetadataSummary.templateKey}</p>
          ) : null}
          {item.safeMetadataSummary?.tagCount !== undefined ? (
            <p>Metadata tags: {item.safeMetadataSummary.tagCount}</p>
          ) : null}
          {item.safeMetadataSummary?.headerKeys?.length ? (
            <p>Header keys: {item.safeMetadataSummary.headerKeys.join(', ')}</p>
          ) : null}
          {item.safeMetadataSummary?.providerHintKeys?.length ? (
            <p>Provider hints: {item.safeMetadataSummary.providerHintKeys.join(', ')}</p>
          ) : null}
          <p>
            <Link
              href={`/system/emails/${item.emailMessageId}`}
              className="underline-offset-4 hover:underline"
            >
              Open email detail
            </Link>
          </p>
          <p>
            <Link
              href={buildEmailsHref(currentQuery, {
                search: item.providerMessageId ?? item.referenceId
              })}
              className="underline-offset-4 hover:underline"
            >
              Narrow email inventory
            </Link>
          </p>
        </div>
      </details>
    </TableCell>
  );
}

function EmailRow({
  item,
  currentQuery
}: {
  item: AdminEmailItem;
  currentQuery: EmailsQueryState;
}) {
  return (
    <TableRow>
      <EmailMessageCell item={item} />
      <EmailProviderCell item={item} />
      <EmailTimingCell item={item} />
      <EmailWebhookCell item={item} />
      <EmailDetailsCell item={item} currentQuery={currentQuery} />
    </TableRow>
  );
}

function EmailMetricsSection({
  metrics
}: {
  metrics: Awaited<ReturnType<typeof getAdminEmailsOverview>>['metrics'];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.slice(0, 4).map((metric) => (
        <Card key={metric.key} className="premium-panel rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="text-[1.85rem] tracking-tighter">{metric.value}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{metric.summary}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InventoryStatusBar({
  total,
  page,
  totalPages,
  generatedAt,
  hasActiveFilters,
  resetHref
}: {
  total: number;
  page: number;
  totalPages: number;
  generatedAt: string;
  hasActiveFilters: boolean;
  resetHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{total} tracked emails</span>
        <span className="text-border">•</span>
        <span>
          Page {page}
          {totalPages > 0 ? ` of ${totalPages}` : ''}
        </span>
        <span className="text-border">•</span>
        <span>Generated {formatTimestamp(generatedAt)}</span>
      </div>
      {hasActiveFilters ? (
        <Link
          href={resetHref}
          className="inline-flex items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}

function EmailsPaginationBar({
  query,
  page,
  totalPages,
  hasPrevious,
  hasNext
}: {
  query: EmailsQueryState;
  page: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  return (
    <Pagination className="justify-between rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2">
      <PaginationContent>
        <PaginationItem>
          {hasPrevious ? (
            <PaginationPrevious href={buildEmailsHref(query, { page: page - 1 })} />
          ) : (
            <PaginationLink aria-disabled="true" className="pointer-events-none opacity-50">
              Previous
            </PaginationLink>
          )}
        </PaginationItem>
      </PaginationContent>
      <div className="text-sm text-muted-foreground">
        Page {page}
        {totalPages > 0 ? ` of ${totalPages}` : ''}
      </div>
      <PaginationContent>
        <PaginationItem>
          {hasNext ? (
            <PaginationNext href={buildEmailsHref(query, { page: page + 1 })} />
          ) : (
            <PaginationLink aria-disabled="true" className="pointer-events-none opacity-50">
              Next
            </PaginationLink>
          )}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export default async function EmailsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const query = parseEmailsQuery(resolvedParams);

  const overview = await getAdminEmailsOverview({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search || undefined,
    organizationId: query.organizationId || undefined,
    messageStatus: query.messageStatus !== 'all' ? query.messageStatus : undefined,
    provider: query.provider || undefined,
    providerStatus: query.providerStatus || undefined,
    normalizedProviderStatus: query.normalizedProviderStatus || undefined,
    referenceType: query.referenceType || undefined,
    referenceId: query.referenceId || undefined,
    webhookAttentionState:
      query.webhookAttentionState !== 'all' ? query.webhookAttentionState : undefined,
    dateFrom: query.dateFrom || undefined,
    dateTo: query.dateTo || undefined,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder
  });

  const activeFilters = buildEmailActiveFilters(query);
  const resetHref = buildEmailResetHref(query);
  const hasActiveFilters = activeFilters.length > 0;
  const hasEmails = overview.items.length > 0;

  return (
    <AppPage className="space-y-7">
      <PageHeader
        title="Emails"
        badge="System"
        description="Browse tracked outbound emails with tenant scope, provider posture, and direct links into webhook investigations."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/system/email-webhooks"
              className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              Open webhook operations
            </Link>
          </div>
        }
      />

      <EmailMetricsSection metrics={overview.metrics} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <Card className="premium-panel rounded-xl border-border/70 xl:order-1">
          <CardHeader className="gap-3 border-b border-border/70 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg tracking-[-0.03em]">Email inventory</CardTitle>
              <CardDescription className="text-sm leading-6">
                Review tracked messages, latest provider posture, and webhook attention indicators.
              </CardDescription>
            </div>

            <InventoryStatusBar
              total={overview.pagination.total}
              page={overview.pagination.page}
              totalPages={overview.pagination.totalPages}
              generatedAt={overview.generatedAt}
              hasActiveFilters={hasActiveFilters}
              resetHref={resetHref}
            />

            <form
              action="/system/emails"
              method="get"
              className="grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.9fr))_auto]"
            >
              <input
                type="text"
                name="search"
                defaultValue={query.search}
                placeholder="Search subject, reference, provider ids"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              />
              <input
                type="text"
                name="organizationId"
                defaultValue={query.organizationId}
                placeholder="Organization id"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              />
              <select
                name="messageStatus"
                defaultValue={query.messageStatus}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              >
                <option value="all">Status: All</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="bounced">Bounced</option>
                <option value="complained">Complained</option>
              </select>
              <input
                type="text"
                name="provider"
                defaultValue={query.provider}
                placeholder="Provider"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              />
              <select
                name="webhookAttentionState"
                defaultValue={query.webhookAttentionState}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              >
                <option value="all">Webhook: All</option>
                <option value="attention">Needs attention</option>
                <option value="clear">Clear</option>
              </select>
              <input type="hidden" name="providerStatus" value={query.providerStatus} />
              <input
                type="hidden"
                name="normalizedProviderStatus"
                value={query.normalizedProviderStatus}
              />
              <input type="hidden" name="referenceType" value={query.referenceType} />
              <input type="hidden" name="referenceId" value={query.referenceId} />
              <input type="hidden" name="dateFrom" value={query.dateFrom} />
              <input type="hidden" name="dateTo" value={query.dateTo} />
              <input type="hidden" name="sortBy" value={query.sortBy} />
              <input type="hidden" name="sortOrder" value={query.sortOrder} />
              <input type="hidden" name="pageSize" value={String(query.pageSize)} />
              <input type="hidden" name="page" value="1" />
              <button
                type="submit"
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-background/80"
              >
                Update list
              </button>
            </form>

            {hasActiveFilters ? (
              <div className="flex flex-wrap gap-2">
                {activeFilters.map((filter) => (
                  <Badge key={filter} variant="secondary" className="rounded-full px-2.5 py-1">
                    {filter}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {!hasEmails ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-10 text-center">
                <p className="text-sm font-medium text-foreground">No tracked emails available</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust the current search or filters to broaden the inventory.
                </p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4">Message</TableHead>
                      <TableHead className="px-4">Provider</TableHead>
                      <TableHead className="px-4">Timing</TableHead>
                      <TableHead className="px-4">Webhook posture</TableHead>
                      <TableHead className="px-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.items.map((item) => (
                      <EmailRow key={item.emailMessageId} item={item} currentQuery={query} />
                    ))}
                  </TableBody>
                </Table>

                <EmailsPaginationBar
                  query={query}
                  page={overview.pagination.page}
                  totalPages={overview.pagination.totalPages}
                  hasPrevious={overview.pagination.hasPrevious}
                  hasNext={overview.pagination.hasNext}
                />
              </>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4 xl:order-2 xl:sticky xl:top-4 xl:self-start">
          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="space-y-1.5 pb-3">
              <CardTitle className="text-sm tracking-[-0.02em]">Filters</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Use provider delivery posture, reference scope, and date windows to narrow the list.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <form action="/system/emails" method="get" className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Provider status
                    </span>
                    <input
                      type="text"
                      name="providerStatus"
                      defaultValue={query.providerStatus}
                      placeholder="delivered"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Normalized status
                    </span>
                    <input
                      type="text"
                      name="normalizedProviderStatus"
                      defaultValue={query.normalizedProviderStatus}
                      placeholder="delivered"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Reference type
                    </span>
                    <input
                      type="text"
                      name="referenceType"
                      defaultValue={query.referenceType}
                      placeholder="invitation"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Reference id
                    </span>
                    <input
                      type="text"
                      name="referenceId"
                      defaultValue={query.referenceId}
                      placeholder="invite_123"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      From
                    </span>
                    <input
                      type="text"
                      name="dateFrom"
                      defaultValue={query.dateFrom}
                      placeholder="2026-03-17T00:00:00.000Z"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      To
                    </span>
                    <input
                      type="text"
                      name="dateTo"
                      defaultValue={query.dateTo}
                      placeholder="2026-03-18T00:00:00.000Z"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Sort by
                    </span>
                    <select
                      name="sortBy"
                      defaultValue={query.sortBy}
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    >
                      <option value="createdAt">Created</option>
                      <option value="updatedAt">Updated</option>
                      <option value="acceptedAt">Accepted</option>
                      <option value="deliveredAt">Delivered</option>
                      <option value="failedAt">Failed</option>
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Sort order
                    </span>
                    <select
                      name="sortOrder"
                      defaultValue={query.sortOrder}
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    >
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </label>
                </div>
                <input type="hidden" name="search" value={query.search} />
                <input type="hidden" name="organizationId" value={query.organizationId} />
                <input type="hidden" name="messageStatus" value={query.messageStatus} />
                <input type="hidden" name="provider" value={query.provider} />
                <input
                  type="hidden"
                  name="webhookAttentionState"
                  value={query.webhookAttentionState}
                />
                <input type="hidden" name="pageSize" value={String(query.pageSize)} />
                <input type="hidden" name="page" value="1" />
                <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
                  <button
                    type="submit"
                    className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-background/80"
                  >
                    Apply
                  </button>
                  <Link
                    href={resetHref}
                    className="inline-flex items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Reset
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="space-y-1.5 pb-3">
              <CardTitle className="text-sm tracking-[-0.02em]">Cross-links</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Move from a tracked email into tenant detail or the correlated webhook
                investigation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
              <p>Use tenant detail when you need broader org context for a delivery issue.</p>
              <p>
                Use webhook operations when provider ids or unmatched webhook counts need
                explanation.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </AppPage>
  );
}

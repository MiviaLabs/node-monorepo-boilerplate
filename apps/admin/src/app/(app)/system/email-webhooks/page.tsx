import Link from 'next/link';
import React from 'react';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { EmailWebhookRowActions } from '~/components/admin/email-webhook-row-actions';
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
import {
  getAdminEmailWebhookEvents,
  getAdminEmailWebhookSummary,
  type AdminEmailWebhookEventItem
} from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';
import { cn } from '~/lib/utils';

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type EmailWebhookQueryState = {
  page: number;
  pageSize: number;
  provider: string;
  processingStatus: string;
  verificationStatus: string;
  organizationId: string;
  normalizedEventType: string;
  providerEventType: string;
  providerMessageId: string;
  providerDeliveryId: string;
  providerEventId: string;
  emailMessageId: string;
  dateFrom: string;
  dateTo: string;
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

function getProcessingTone(status: string): string {
  switch (status) {
    case 'applied':
      return 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
    case 'failed':
    case 'unmatched':
      return 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300';
  }
}

function getVerificationTone(status: string): string {
  switch (status) {
    case 'verified':
      return 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
    case 'failed':
      return 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300';
    default:
      return 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300';
  }
}

function buildEmailInvestigationHref(item: AdminEmailWebhookEventItem): string {
  const search =
    item.providerMessageId ??
    item.providerDeliveryId ??
    item.providerEventId ??
    item.referenceId ??
    undefined;

  return buildEmailsHref(
    {},
    {
      search,
      organizationId: item.organizationId,
      provider: item.provider
    }
  );
}

function buildTenantHref(item: AdminEmailWebhookEventItem): string | undefined {
  if (item.organizationId === undefined) {
    return undefined;
  }

  return `/tenants/${item.organizationId}`;
}

function parseEmailWebhookQuery(params: SearchParamsRecord): EmailWebhookQueryState {
  return {
    page: parsePositiveInt(getParam(params, 'page'), 1),
    pageSize: parsePositiveInt(getParam(params, 'pageSize'), 20),
    provider: getParam(params, 'provider') ?? '',
    processingStatus: getParam(params, 'processingStatus') ?? 'all',
    verificationStatus: getParam(params, 'verificationStatus') ?? 'all',
    organizationId: getParam(params, 'organizationId') ?? '',
    normalizedEventType: getParam(params, 'normalizedEventType') ?? '',
    providerEventType: getParam(params, 'providerEventType') ?? '',
    providerMessageId: getParam(params, 'providerMessageId') ?? '',
    providerDeliveryId: getParam(params, 'providerDeliveryId') ?? '',
    providerEventId: getParam(params, 'providerEventId') ?? '',
    emailMessageId: getParam(params, 'emailMessageId') ?? '',
    dateFrom: getParam(params, 'dateFrom') ?? '',
    dateTo: getParam(params, 'dateTo') ?? ''
  };
}

function buildWebhookActiveFilters(query: EmailWebhookQueryState): string[] {
  return [
    query.provider ? `Provider: ${query.provider}` : null,
    query.processingStatus !== 'all' ? `Processing: ${query.processingStatus}` : null,
    query.verificationStatus !== 'all' ? `Verification: ${query.verificationStatus}` : null,
    query.organizationId ? `Organization: ${query.organizationId}` : null,
    query.normalizedEventType ? `Normalized event: ${query.normalizedEventType}` : null,
    query.providerEventType ? `Provider event: ${query.providerEventType}` : null,
    query.providerMessageId ? `Message id: ${query.providerMessageId}` : null,
    query.providerDeliveryId ? `Delivery id: ${query.providerDeliveryId}` : null,
    query.providerEventId ? `Provider event id: ${query.providerEventId}` : null,
    query.emailMessageId ? `Email message: ${query.emailMessageId}` : null,
    query.dateFrom ? `From: ${query.dateFrom}` : null,
    query.dateTo ? `To: ${query.dateTo}` : null
  ].filter(Boolean) as string[];
}

function buildWebhookResetHref(query: EmailWebhookQueryState): string {
  return buildEmailWebhooksHref(query, {
    page: 1,
    pageSize: 20,
    provider: undefined,
    processingStatus: undefined,
    verificationStatus: undefined,
    organizationId: undefined,
    normalizedEventType: undefined,
    providerEventType: undefined,
    providerMessageId: undefined,
    providerDeliveryId: undefined,
    providerEventId: undefined,
    emailMessageId: undefined,
    dateFrom: undefined,
    dateTo: undefined
  });
}

function getWebhookActionLabel(
  item: AdminEmailWebhookEventItem,
  canReprocess: boolean
): string | null {
  if (
    canReprocess &&
    (item.processingStatus === 'failed' ||
      item.processingStatus === 'unmatched' ||
      item.processingStatus === 'persisted')
  ) {
    return null;
  }

  return canReprocess ? 'No action needed' : 'Requires system settings permission';
}

function EmailWebhookEventRow({
  item,
  canReprocess
}: {
  item: AdminEmailWebhookEventItem;
  canReprocess: boolean;
}) {
  const tenantHref = buildTenantHref(item);
  const emailHref = buildEmailInvestigationHref(item);
  const actionLabel = getWebhookActionLabel(item, canReprocess);

  return (
    <TableRow key={item.id}>
      <TableCell className="align-top px-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{item.providerEventType}</p>
            <Badge
              variant="outline"
              size="sm"
              className={cn('border', getProcessingTone(item.processingStatus))}
            >
              {item.processingStatus}
            </Badge>
            <Badge
              variant="outline"
              size="sm"
              className={cn('border', getVerificationTone(item.verificationStatus))}
            >
              {item.verificationStatus}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {item.provider} • {item.normalizedEventType}
          </p>
          <p className="text-xs text-muted-foreground">
            Event {item.id}
            {item.providerEventId ? ` • Provider event ${item.providerEventId}` : ''}
          </p>
        </div>
      </TableCell>
      <TableCell className="align-top px-4 text-sm text-muted-foreground">
        <div className="space-y-1">
          <p>{item.providerMessageId ?? 'No provider message id'}</p>
          <p className="text-xs">{item.providerDeliveryId ?? 'No provider delivery id'}</p>
          <p className="text-xs">Attempts {item.attemptCount}</p>
          {item.processingError ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">{item.processingError}</p>
          ) : (
            <p className="text-xs">No processing error recorded</p>
          )}
        </div>
      </TableCell>
      <TableCell className="align-top px-4 text-sm text-muted-foreground">
        <div className="space-y-1">
          {tenantHref ? (
            <Link href={tenantHref} className="font-medium underline-offset-4 hover:underline">
              {item.organizationName ?? `Organization ${item.organizationId}`}
            </Link>
          ) : (
            <p>Unmatched organization</p>
          )}
          <p className="text-xs">
            {item.emailMessageId !== undefined
              ? `Email message ${item.emailMessageId}`
              : 'No email message linked'}
          </p>
          <p className="text-xs">
            {item.messageStatus
              ? `Message status ${item.messageStatus}`
              : 'No message status linked'}
          </p>
          <p className="text-xs">
            {item.latestProviderStatus
              ? `Latest provider ${item.latestProviderStatus}`
              : 'No provider delivery state linked'}
          </p>
          {item.referenceType || item.referenceId ? (
            <p className="text-xs">
              {item.referenceType ?? 'reference'} {item.referenceId ?? ''}
            </p>
          ) : null}
          <Link href={emailHref} className="text-xs font-medium underline-offset-4 hover:underline">
            Open email inventory
          </Link>
        </div>
      </TableCell>
      <TableCell className="align-top px-4 text-sm text-muted-foreground">
        <div className="space-y-1">
          <p>Occurred {formatTimestamp(item.occurredAt)}</p>
          <p>Received {formatTimestamp(item.receivedAt)}</p>
          <p>Processed {formatTimestamp(item.processedAt)}</p>
        </div>
      </TableCell>
      <TableCell className="align-top px-4">
        {actionLabel ? (
          <p className="text-xs text-muted-foreground">{actionLabel}</p>
        ) : (
          <EmailWebhookRowActions eventId={item.id} providerEventType={item.providerEventType} />
        )}
      </TableCell>
    </TableRow>
  );
}

function EmailWebhookSummaryCards({
  summary
}: {
  summary: Awaited<ReturnType<typeof getAdminEmailWebhookSummary>>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Card className="premium-panel rounded-xl border-border/70">
        <CardHeader className="pb-2">
          <CardDescription>Total events</CardDescription>
          <CardTitle className="text-[1.85rem] tracking-tighter">{summary.totalEvents}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Cross-tenant inbound webhook records.</p>
        </CardContent>
      </Card>
      <Card className="premium-panel rounded-xl border-border/70">
        <CardHeader className="pb-2">
          <CardDescription>Applied</CardDescription>
          <CardTitle className="text-[1.85rem] tracking-tighter">{summary.appliedEvents}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Successfully correlated and applied.</p>
        </CardContent>
      </Card>
      <Card className="premium-panel rounded-xl border-border/70">
        <CardHeader className="pb-2">
          <CardDescription>Needs attention</CardDescription>
          <CardTitle className="text-[1.85rem] tracking-tighter">
            {summary.failedEvents + summary.unmatchedEvents}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed or unmatched processing.</p>
        </CardContent>
      </Card>
      <Card className="premium-panel rounded-xl border-border/70">
        <CardHeader className="pb-2">
          <CardDescription>Retryable now</CardDescription>
          <CardTitle className="text-[1.85rem] tracking-tighter">
            {summary.retryableEvents}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Latest received {formatTimestamp(summary.latestReceivedAt)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function EmailWebhookStatusBar({
  total,
  page,
  totalPages,
  latestReceivedAt,
  hasActiveFilters,
  resetHref
}: {
  total: number;
  page: number;
  totalPages: number;
  latestReceivedAt?: string;
  hasActiveFilters: boolean;
  resetHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{total} webhook events</span>
        <span className="text-border">•</span>
        <span>
          Page {page}
          {totalPages > 0 ? ` of ${totalPages}` : ''}
        </span>
        <span className="text-border">•</span>
        <span>Latest received {formatTimestamp(latestReceivedAt)}</span>
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

function EmailWebhookPaginationBar({
  query,
  page,
  totalPages,
  hasPrevious,
  hasNext
}: {
  query: EmailWebhookQueryState;
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
            <PaginationPrevious href={buildEmailWebhooksHref(query, { page: page - 1 })} />
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
            <PaginationNext href={buildEmailWebhooksHref(query, { page: page + 1 })} />
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

function buildEmailWebhookEventsInput(query: EmailWebhookQueryState) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    provider: query.provider || undefined,
    processingStatus: query.processingStatus !== 'all' ? query.processingStatus : undefined,
    verificationStatus: query.verificationStatus !== 'all' ? query.verificationStatus : undefined,
    organizationId: query.organizationId || undefined,
    normalizedEventType: query.normalizedEventType || undefined,
    providerEventType: query.providerEventType || undefined,
    providerMessageId: query.providerMessageId || undefined,
    providerDeliveryId: query.providerDeliveryId || undefined,
    providerEventId: query.providerEventId || undefined,
    emailMessageId: query.emailMessageId || undefined,
    dateFrom: query.dateFrom || undefined,
    dateTo: query.dateTo || undefined
  };
}

async function loadEmailWebhookPageData(query: EmailWebhookQueryState) {
  return Promise.all([
    getAdminEmailWebhookSummary(),
    getAdminEmailWebhookEvents(buildEmailWebhookEventsInput(query)),
    getAdminSession()
  ]);
}

export default async function EmailWebhooksPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const query = parseEmailWebhookQuery(resolvedParams);
  const [summary, overview, session] = await loadEmailWebhookPageData(query);
  const canReprocess = session?.user.permissions.includes('system:system:settings') ?? false;
  const totalPages =
    overview.total > 0 ? Math.max(1, Math.ceil(overview.total / overview.pageSize)) : 0;
  const hasPrevious = overview.page > 1;
  const hasNext = overview.page * overview.pageSize < overview.total;
  const activeFilters = buildWebhookActiveFilters(query);
  const resetHref = buildWebhookResetHref(query);
  const hasActiveFilters = activeFilters.length > 0;
  const hasItems = overview.items.length > 0;

  return (
    <AppPage className="space-y-7">
      <PageHeader
        title="Email webhooks"
        badge="System"
        description="Investigate inbound webhook correlations, track verification and processing posture, and reprocess safe retry candidates."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/system/emails"
              className="inline-flex items-center rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              Open email inventory
            </Link>
          </div>
        }
      />

      <EmailWebhookSummaryCards summary={summary} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <Card className="premium-panel rounded-xl border-border/70 xl:order-1">
          <CardHeader className="gap-3 border-b border-border/70 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg tracking-[-0.03em]">Operational event list</CardTitle>
              <CardDescription className="text-sm leading-6">
                Filter by correlation fields, tenant scope, and timing windows without losing the
                investigation workspace.
              </CardDescription>
            </div>

            <EmailWebhookStatusBar
              total={overview.total}
              page={overview.page}
              totalPages={totalPages}
              latestReceivedAt={summary.latestReceivedAt}
              hasActiveFilters={hasActiveFilters}
              resetHref={resetHref}
            />

            <form
              action="/system/email-webhooks"
              method="get"
              className="grid gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
            >
              <select
                name="processingStatus"
                defaultValue={query.processingStatus}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              >
                <option value="all">Processing: All</option>
                <option value="received">Received</option>
                <option value="persisted">Persisted</option>
                <option value="applied">Applied</option>
                <option value="unmatched">Unmatched</option>
                <option value="failed">Failed</option>
              </select>
              <select
                name="verificationStatus"
                defaultValue={query.verificationStatus}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              >
                <option value="all">Verification: All</option>
                <option value="verified">Verified</option>
                <option value="skipped">Skipped</option>
                <option value="failed">Failed</option>
              </select>
              <input
                type="text"
                name="provider"
                defaultValue={query.provider}
                placeholder="Provider"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              />
              <input
                type="text"
                name="organizationId"
                defaultValue={query.organizationId}
                placeholder="Organization id"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              />
              <input type="hidden" name="page" value="1" />
              <input type="hidden" name="pageSize" value={String(query.pageSize)} />
              <input type="hidden" name="normalizedEventType" value={query.normalizedEventType} />
              <input type="hidden" name="providerEventType" value={query.providerEventType} />
              <input type="hidden" name="providerMessageId" value={query.providerMessageId} />
              <input type="hidden" name="providerDeliveryId" value={query.providerDeliveryId} />
              <input type="hidden" name="providerEventId" value={query.providerEventId} />
              <input type="hidden" name="emailMessageId" value={query.emailMessageId} />
              <input type="hidden" name="dateFrom" value={query.dateFrom} />
              <input type="hidden" name="dateTo" value={query.dateTo} />
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Event</TableHead>
                  <TableHead className="px-4">Correlation</TableHead>
                  <TableHead className="px-4">Email context</TableHead>
                  <TableHead className="px-4">Timing</TableHead>
                  <TableHead className="px-4">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hasItems ? (
                  overview.items.map((item) => (
                    <EmailWebhookEventRow key={item.id} item={item} canReprocess={canReprocess} />
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No email webhook events matched the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <EmailWebhookPaginationBar
              query={query}
              page={overview.page}
              totalPages={totalPages}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
            />
          </CardContent>
        </Card>

        <aside className="space-y-4 xl:order-2 xl:sticky xl:top-4 xl:self-start">
          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="space-y-1.5 pb-3">
              <CardTitle className="text-sm tracking-[-0.02em]">Filters</CardTitle>
              <CardDescription className="text-[11px] leading-5">
                Narrow investigations by tenant, provider IDs, and event timing.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <form action="/system/email-webhooks" method="get" className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Normalized event
                    </span>
                    <input
                      type="text"
                      name="normalizedEventType"
                      defaultValue={query.normalizedEventType}
                      placeholder="delivered"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Provider event
                    </span>
                    <input
                      type="text"
                      name="providerEventType"
                      defaultValue={query.providerEventType}
                      placeholder="email.delivered"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Message id
                    </span>
                    <input
                      type="text"
                      name="providerMessageId"
                      defaultValue={query.providerMessageId}
                      placeholder="msg_123"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Delivery id
                    </span>
                    <input
                      type="text"
                      name="providerDeliveryId"
                      defaultValue={query.providerDeliveryId}
                      placeholder="delivery_123"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Provider event id
                    </span>
                    <input
                      type="text"
                      name="providerEventId"
                      defaultValue={query.providerEventId}
                      placeholder="evt_123"
                      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Email message id
                    </span>
                    <input
                      type="text"
                      name="emailMessageId"
                      defaultValue={query.emailMessageId}
                      placeholder="42"
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
                </div>
                <input type="hidden" name="provider" value={query.provider} />
                <input type="hidden" name="processingStatus" value={query.processingStatus} />
                <input type="hidden" name="verificationStatus" value={query.verificationStatus} />
                <input type="hidden" name="organizationId" value={query.organizationId} />
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
                Use provider identifiers to move between webhook events and tracked emails.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
              <p>Start here when a provider event lands without a clear tenant or message link.</p>
              <p>
                Jump into email inventory once a message id, provider message id, or delivery id is
                known.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </AppPage>
  );
}

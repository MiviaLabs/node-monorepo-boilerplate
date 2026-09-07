import { ChevronRight, Layers3, Mail, Send, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import React from 'react';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { EmailWebhookRowActions } from '~/components/admin/email-webhook-row-actions';
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
import { getAdminEmailDetail, type AdminEmailDetail } from '~/lib/admin';
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

async function loadEmailDetail(emailMessageId: number) {
  try {
    return await getAdminEmailDetail(emailMessageId);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}

function buildWebhookHref(detail: AdminEmailDetail): string {
  return new URLSearchParams({
    organizationId: String(detail.item.organizationId),
    emailMessageId: String(detail.item.emailMessageId),
    provider: detail.item.provider ?? ''
  }).toString();
}

function MessageHeaderActions({
  messageStatus,
  webhookAttentionState
}: {
  messageStatus: string;
  webhookAttentionState: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" size="sm" className={cn('border', getMessageTone(messageStatus))}>
        {messageStatus}
      </Badge>
      {webhookAttentionState === 'attention' ? (
        <Badge
          variant="outline"
          size="sm"
          className="border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300"
        >
          webhook attention
        </Badge>
      ) : null}
    </div>
  );
}

function ProviderAttemptsSection({
  providerAttempts
}: {
  providerAttempts: AdminEmailDetail['providerAttempts'];
}) {
  if (providerAttempts.length === 0) {
    return <p className="text-sm text-muted-foreground">No provider attempts were recorded.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Attempt</TableHead>
          <TableHead>Identifiers</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Timing</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {providerAttempts.map((attempt) => (
          <TableRow key={attempt.id}>
            <TableCell className="align-top">
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {attempt.provider} attempt {attempt.attemptNumber}
                </p>
                <p className="text-xs text-muted-foreground">Record {attempt.id}</p>
              </div>
            </TableCell>
            <TableCell className="align-top text-sm text-muted-foreground">
              <div className="space-y-1">
                <p>{attempt.providerMessageId ?? 'No provider message id'}</p>
                <p className="text-xs">{attempt.providerDeliveryId ?? 'No provider delivery id'}</p>
                <p className="text-xs">{attempt.providerEventId ?? 'No provider event id'}</p>
              </div>
            </TableCell>
            <TableCell className="align-top text-sm text-muted-foreground">
              <div className="space-y-1">
                <p>{attempt.providerStatus ?? 'No provider status'}</p>
                <p className="text-xs">
                  {attempt.normalizedProviderStatus ?? 'No normalized status'}
                </p>
                <p className="text-xs">{attempt.correlationId ?? 'No correlation id'}</p>
              </div>
            </TableCell>
            <TableCell className="align-top text-sm text-muted-foreground">
              <div className="space-y-1">
                <p>Accepted {formatTimestamp(attempt.acceptedAt)}</p>
                <p>Webhook {formatTimestamp(attempt.lastWebhookAt)}</p>
                <p className="text-xs">Created {formatTimestamp(attempt.createdAt)}</p>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function getWebhookActionLabel(processingStatus: string, canReprocess: boolean): string | null {
  if (canReprocess && (processingStatus === 'failed' || processingStatus === 'unmatched')) {
    return null;
  }

  return canReprocess ? 'No action needed' : 'Requires system settings permission';
}

function RelatedWebhookEventsSection({
  relatedWebhookEvents,
  canReprocess
}: {
  relatedWebhookEvents: AdminEmailDetail['relatedWebhookEvents'];
  canReprocess: boolean;
}) {
  if (relatedWebhookEvents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No correlated webhook events were recorded.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          <TableHead>Provider ids</TableHead>
          <TableHead>Processing</TableHead>
          <TableHead>Timing</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {relatedWebhookEvents.map((event) => {
          const actionLabel = getWebhookActionLabel(event.processingStatus, canReprocess);

          return (
            <TableRow key={event.id}>
              <TableCell className="align-top">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{event.providerEventType}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.provider} • {event.normalizedEventType}
                  </p>
                </div>
              </TableCell>
              <TableCell className="align-top text-sm text-muted-foreground">
                <div className="space-y-1">
                  <p>{event.providerMessageId ?? 'No provider message id'}</p>
                  <p className="text-xs">{event.providerDeliveryId ?? 'No delivery id'}</p>
                  <p className="text-xs">{event.providerEventId ?? 'No event id'}</p>
                </div>
              </TableCell>
              <TableCell className="align-top text-sm text-muted-foreground">
                <div className="space-y-1">
                  <Badge
                    variant="outline"
                    size="sm"
                    className={cn('border', getProcessingTone(event.processingStatus))}
                  >
                    {event.processingStatus}
                  </Badge>
                  <p className="text-xs">Verification {event.verificationStatus}</p>
                  <p className="text-xs">Attempts {event.attemptCount}</p>
                  <p className="text-xs">{event.processingError ?? 'No processing error'}</p>
                </div>
              </TableCell>
              <TableCell className="align-top text-sm text-muted-foreground">
                <div className="space-y-1">
                  <p>Occurred {formatTimestamp(event.occurredAt)}</p>
                  <p>Received {formatTimestamp(event.receivedAt)}</p>
                  <p>Processed {formatTimestamp(event.processedAt)}</p>
                </div>
              </TableCell>
              <TableCell className="align-top text-sm text-muted-foreground">
                {actionLabel ? (
                  <p className="text-xs text-muted-foreground">{actionLabel}</p>
                ) : (
                  <EmailWebhookRowActions
                    eventId={event.id}
                    providerEventType={event.providerEventType}
                  />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SafeMetadataSection({
  safeMetadataSummary
}: {
  safeMetadataSummary: AdminEmailDetail['item']['safeMetadataSummary'];
}) {
  if (!safeMetadataSummary) {
    return <p className="text-sm text-muted-foreground">No safe metadata summary is available.</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <DetailField label="Template" value={safeMetadataSummary.templateKey ?? 'Not available'} />
      <DetailField label="Tag count" value={String(safeMetadataSummary.tagCount ?? 0)} />
      <DetailField
        label="Header keys"
        value={safeMetadataSummary.headerKeys?.join(', ') ?? 'Not available'}
      />
      <DetailField
        label="Provider hints"
        value={safeMetadataSummary.providerHintKeys?.join(', ') ?? 'Not available'}
      />
    </div>
  );
}

export default async function EmailDetailPage({
  params
}: {
  params: Promise<{ emailMessageId: string }>;
}) {
  const resolvedParams = await params;
  const emailMessageId = Number(resolvedParams.emailMessageId);

  if (!Number.isInteger(emailMessageId) || emailMessageId <= 0) {
    notFound();
  }

  const detail = await loadEmailDetail(emailMessageId);
  const email = detail.item;
  const session = await getAdminSession();
  const canReprocess = session?.user.permissions.includes('system:system:settings') ?? false;
  const webhookHref = buildWebhookHref(detail);

  return (
    <AppPage className="space-y-5">
      <div className="space-y-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/system/emails">Emails</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-3.5 w-3.5" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>{email.subject ?? `Email ${email.emailMessageId}`}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          title={email.subject ?? `Email ${email.emailMessageId}`}
          badge="Email detail"
          description="Inspect the tracked message, every provider attempt, and correlated webhook history from one admin detail view."
          actions={
            <MessageHeaderActions
              messageStatus={email.messageStatus}
              webhookAttentionState={email.webhookAttentionState}
            />
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
              <DetailField label="Organization" value={email.organizationName} />
              <DetailField
                label="Provider attempts"
                value={String(detail.providerAttempts.length)}
              />
              <DetailField
                label="Webhook events"
                value={String(detail.relatedWebhookEvents.length)}
              />
              <DetailField
                label="Reference"
                value={
                  email.referenceType || email.referenceId
                    ? `${email.referenceType ?? 'reference'} ${email.referenceId ?? ''}`.trim()
                    : 'No reference'
                }
              />
            </div>
          </DetailCard>
        </aside>

        <div className="min-w-0 space-y-4">
          <DetailCard
            title="Message"
            description="Primary tracked email record and latest delivery posture."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailField label="Email message id" value={String(email.emailMessageId)} />
              <DetailField label="Public id" value={email.publicId} />
              <DetailField label="Organization id" value={String(email.organizationId)} />
              <DetailField label="Provider" value={email.provider ?? 'Not available'} />
              <DetailField
                label="Provider status"
                value={email.providerStatus ?? 'Not available'}
              />
              <DetailField
                label="Normalized status"
                value={email.normalizedProviderStatus ?? 'Not available'}
              />
              <DetailField label="Accepted" value={formatTimestamp(email.acceptedAt)} />
              <DetailField label="Delivered" value={formatTimestamp(email.deliveredAt)} />
              <DetailField label="Failed" value={formatTimestamp(email.failedAt)} />
              <DetailField label="Last webhook" value={formatTimestamp(email.lastWebhookAt)} />
              <DetailField
                label="Latest webhook status"
                value={email.latestWebhookProcessingStatus ?? 'Not available'}
              />
              <DetailField label="Correlation" value={email.correlationId ?? 'Not available'} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/tenants/${email.organizationId}`}
                className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
              >
                <Mail className="h-4 w-4" />
                View tenant
              </Link>
              <Link
                href={`/system/email-webhooks?${webhookHref.toString()}`}
                className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
              >
                <ShieldAlert className="h-4 w-4" />
                View related webhooks
              </Link>
            </div>
          </DetailCard>

          <DetailCard
            title="Provider attempts"
            description="Every known provider attempt for this tracked message, ordered newest first."
          >
            <ProviderAttemptsSection providerAttempts={detail.providerAttempts} />
          </DetailCard>

          <DetailCard
            title="Related webhook events"
            description="Correlated inbound webhook records for this email message."
          >
            <RelatedWebhookEventsSection
              relatedWebhookEvents={detail.relatedWebhookEvents}
              canReprocess={canReprocess}
            />
          </DetailCard>

          <DetailCard title="Safe metadata" description="Admin-safe email metadata only.">
            <SafeMetadataSection safeMetadataSummary={email.safeMetadataSummary} />
          </DetailCard>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/system/emails"
              className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              <Layers3 className="h-4 w-4" />
              Back to emails
            </Link>
            <Link
              href={`/system/email-webhooks?${webhookHref.toString()}`}
              className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--panel-subtle))]"
            >
              <Send className="h-4 w-4" />
              Open webhook investigation
            </Link>
          </div>
        </div>
      </div>
    </AppPage>
  );
}

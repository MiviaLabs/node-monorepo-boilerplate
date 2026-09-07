import React from 'react';
import Link from 'next/link';

import { AppPage } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { ChannelVolumeChart } from '~/components/statistics/channel-volume-chart';
import { ServiceReliabilityChart } from '~/components/statistics/service-reliability-chart';
import { ThroughputAreaChart } from '~/components/statistics/throughput-area-chart';
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
import { getAdminStatisticsOverview } from '~/lib/admin';

export default async function StatisticsPage() {
  const overview = await getAdminStatisticsOverview();
  const deletionSummary = overview.deletionSummary;
  const outboxSummary = overview.outboxSummary;

  return (
    <AppPage className="space-y-6">
      <PageHeader
        title="Statistics"
        badge="Overview"
        description="Reference DB-backed operational counts, invitation posture, and delivery-state trends from one reporting surface."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
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

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="border-b border-border/70 pb-4">
            <Badge
              variant="secondary"
              className="w-fit rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
            >
              Delivery
            </Badge>
            <CardTitle>Published deliveries, retries, and dead letters</CardTitle>
            <CardDescription>
              Recent persisted outbox activity from successful deliveries, retry attempts, and
              dead-letter events.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ThroughputAreaChart data={overview.eventDeliverySeries} />
          </CardContent>
        </Card>

        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="border-b border-border/70 pb-4">
            <Badge
              variant="secondary"
              className="w-fit rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
            >
              Volume
            </Badge>
            <CardTitle>Platform volume</CardTitle>
            <CardDescription>
              Current persisted counts across tenant, user, invitation, and retryable event groups.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ChannelVolumeChart
              data={overview.volumeBreakdown.map((item) => ({
                label: item.label,
                value: item.value
              }))}
            />
          </CardContent>
        </Card>

        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="border-b border-border/70 pb-4">
            <Badge
              variant="secondary"
              className="w-fit rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
            >
              Outbox
            </Badge>
            <CardTitle>Delivery state distribution</CardTitle>
            <CardDescription>
              Persisted outbox status split across published, pending, failed, and processing
              events.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ServiceReliabilityChart data={overview.deliveryStateRollup} />
          </CardContent>
        </Card>

        <Card className="premium-panel rounded-xl border-border/70">
          <CardHeader className="border-b border-border/70 pb-4">
            <Badge
              variant="secondary"
              className="w-fit rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
            >
              Snapshot
            </Badge>
            <CardTitle>Operational summary</CardTitle>
            <CardDescription>
              Compact tabular reference for the main persisted reporting groups and their DB
              sources.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-10 px-3">Group</TableHead>
                  <TableHead className="h-10 px-3">Total</TableHead>
                  <TableHead className="h-10 px-3">Detail</TableHead>
                  <TableHead className="h-10 px-3">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.summaryRows.map((row) => (
                  <TableRow key={row.group}>
                    <TableCell className="px-3 py-2.5 font-medium">{row.group}</TableCell>
                    <TableCell className="px-3 py-2.5">{row.total}</TableCell>
                    <TableCell className="px-3 py-2.5 text-muted-foreground">
                      {row.detail}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.source}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {deletionSummary ? (
          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="border-b border-border/70 pb-4">
              <Badge
                variant="secondary"
                className="w-fit rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
              >
                Retention
              </Badge>
              <CardTitle>Deletion queue</CardTitle>
              <CardDescription>
                Soft-deleted records waiting for permanent purge after the configured retention
                window.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Waiting total
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {deletionSummary.totalPending}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {deletionSummary.pendingUsers} users, {deletionSummary.pendingOrganizations}{' '}
                    organizations
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Attention window
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {deletionSummary.dueWithin7Days}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Due within 7 days, {deletionSummary.overdueCount} overdue
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2.5 text-sm text-muted-foreground">
                <span>Retention policy: {deletionSummary.retentionDays} days</span>
                <Link
                  href="/system/deletions"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Open deletion queue
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {outboxSummary ? (
          <Card className="premium-panel rounded-xl border-border/70">
            <CardHeader className="border-b border-border/70 pb-4">
              <Badge
                variant="secondary"
                className="w-fit rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
              >
                Outbox
              </Badge>
              <CardTitle>Outbox queue</CardTitle>
              <CardDescription>
                Read-only queue health for persisted deliveries that are pending, retrying, or
                dead-lettered.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Pending pressure
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {outboxSummary.pending}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {outboxSummary.processing} processing, {outboxSummary.retryable} retryable
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Failure watch
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {outboxSummary.deadLettered}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dead-lettered
                    {outboxSummary.highlights.oldestPendingAgeMinutes !== undefined
                      ? `, oldest pending ${outboxSummary.highlights.oldestPendingAgeMinutes} min`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2.5 text-sm text-muted-foreground">
                <span>Live read-only monitor for delivery backlog and retry state</span>
                <Link
                  href="/system/outbox"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Open outbox monitor
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppPage>
  );
}

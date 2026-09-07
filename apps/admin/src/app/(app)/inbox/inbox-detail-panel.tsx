'use client';

import {
  ArrowUpRight,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Building2,
  CheckCheck,
  Clock3,
  ListTodo,
  User2
} from 'lucide-react';
import Link from 'next/link';
import React from 'react';

import { getPriorityTone, type InboxItem, InboxItemKind } from './inbox-data';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';

type ChannelMeta = Record<
  InboxItemKind,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    iconSurfaceClass: string;
  }
>;

export function InboxDetailPanel({
  item,
  channelMeta,
  detailsOpen,
  onToggleDetails
}: {
  item: InboxItem;
  channelMeta: ChannelMeta;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const selectedChannel = channelMeta[item.kind];
  const SelectedIcon = selectedChannel.icon;
  const isPending = item.unread ?? false;
  const detailsPanelId = `${item.id}-details-panel`;

  return (
    <div className="grid min-h-128 grid-rows-[auto_1fr] bg-[hsl(var(--panel))]">
      <div className="border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[10px]">
                {item.kind}
              </Badge>
              <Badge
                variant="outline"
                className={`rounded-md px-2 py-0.5 text-[10px] ${getPriorityTone(item.priority)}`}
              >
                {item.priority} priority
              </Badge>
            </div>
            <div className="space-y-1">
              <h2 className="text-[1.45rem] font-semibold tracking-tight text-foreground">
                {item.title}
              </h2>
              <p className="max-w-3xl text-[15px] leading-7 text-muted-foreground">
                {item.preview}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-controls={detailsPanelId}
            aria-expanded={detailsOpen}
            className="h-9 self-start rounded-lg"
            onClick={onToggleDetails}
          >
            {detailsOpen ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
            {detailsOpen ? 'Hide details' : 'Show details'}
          </Button>
        </div>
      </div>

      <div
        className={`grid gap-0 transition-[grid-template-columns] duration-200 motion-reduce:transition-none ${
          detailsOpen ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : 'xl:grid-cols-[minmax(0,1fr)]'
        }`}
      >
        <ScrollArea className="h-104 xl:h-[calc(100svh-20rem)]">
          <div className="space-y-6 px-5 py-5 sm:px-6">
            <div className="rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-4">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${selectedChannel.iconSurfaceClass}`}
                >
                  <SelectedIcon className="h-4 w-4" />
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {selectedChannel.label} item
                  </p>
                  <div className="space-y-4 text-sm leading-7 text-muted-foreground">
                    {item.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Recommended next step
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{item.actionLabel}</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Focus on the owner handoff and only open the details rail when you need timing,
                    source, or related links.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`w-fit rounded-md px-2 py-0.5 text-[10px] ${getPriorityTone(item.priority)}`}
                >
                  {item.priority} priority
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Activity and next steps
              </p>
              <div className="space-y-2">
                {[
                  `Received from ${item.source} and routed into ${selectedChannel.label.toLowerCase()}.`,
                  `Current owner is ${item.owner} and the recommended next action is ${item.actionLabel.toLowerCase()}.`,
                  `This item is marked ${item.priority.toLowerCase()} priority and was last updated ${item.receivedAt}.`
                ].map((line) => (
                  <div
                    key={line}
                    className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3"
                  >
                    <p className="text-sm leading-6 text-muted-foreground">{line}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {detailsOpen ? (
          <aside
            id={detailsPanelId}
            className="border-t border-border/70 bg-[hsl(var(--panel-subtle))] xl:border-l xl:border-t-0"
          >
            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Details
                </p>
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel))] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <Clock3 className="h-4 w-4 text-muted-foreground" />
                      {item.receivedAt}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel))] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <User2 className="h-4 w-4 text-muted-foreground" />
                      {item.owner}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel))] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {item.context}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Actions
                </p>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-10 w-full justify-start rounded-lg ${
                      isPending
                        ? 'border-[hsl(var(--chart-2)/0.35)] bg-[hsl(var(--chart-2)/0.08)] text-[hsl(var(--chart-2))] hover:border-[hsl(var(--chart-2)/0.5)] hover:bg-[hsl(var(--chart-2)/0.14)] hover:text-[hsl(var(--chart-2))]'
                        : 'border-border/70 bg-[hsl(var(--panel))] text-muted-foreground hover:border-border hover:bg-[hsl(var(--panel-subtle))] hover:text-foreground'
                    }`}
                  >
                    <CheckCheck
                      className={`h-4 w-4 ${
                        isPending ? 'text-[hsl(var(--chart-2))]' : 'text-muted-foreground'
                      }`}
                    />
                    {isPending ? 'Mark done' : 'Completed'}
                  </Button>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-[hsl(var(--panel))] px-4 py-3 text-sm text-foreground transition-colors hover:bg-[hsl(var(--control))]"
                  >
                    <span className="flex items-center gap-2">
                      <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
                      Open related page
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-[hsl(var(--panel))] px-4 py-3 text-sm text-foreground transition-colors hover:bg-[hsl(var(--control))]"
                  >
                    <span className="flex items-center gap-2">
                      <ListTodo className="h-4 w-4 text-muted-foreground" />
                      Add follow-up task
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import { ChevronDown, Filter, Inbox, Plus, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { buildMyWorkInboxModel } from './my-work-inbox';
import { MyWorkInboxLane, type MyWorkInboxItem, type MyWorkIssueEntry } from './my-work-types';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { Separator } from '~/components/ui/separator';

interface MyWorkPageContentProps {
  accessibleProjectCount: number;
  assignedProjectCount: number;
  collaborationProjectCount: number;
  ownedProjectCount: number;
  userHeadline: string;
  canViewProjects: boolean;
  assignedIssues: MyWorkIssueEntry[];
  recentIssues: MyWorkIssueEntry[];
  watchingIssues: MyWorkIssueEntry[];
}

const laneOrder = [
  MyWorkInboxLane.ATTENTION,
  MyWorkInboxLane.IN_PROGRESS,
  MyWorkInboxLane.WATCHING
] as const;

const listTabs = ['All work', 'Active', 'Watching'] as const;

function EmptyPane() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center p-8">
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-border/60 bg-muted/10 text-muted-foreground">
          <Inbox className="h-9 w-9" strokeWidth={1.5} />
        </div>
        <p className="mt-5 text-sm font-medium text-foreground">No activity notifications</p>
      </div>
    </div>
  );
}

function DetailPane({
  item,
  accessibleProjectCount,
  assignedProjectCount,
  collaborationProjectCount,
  ownedProjectCount,
  userHeadline
}: {
  item: MyWorkInboxItem | null;
  accessibleProjectCount: number;
  assignedProjectCount: number;
  collaborationProjectCount: number;
  ownedProjectCount: number;
  userHeadline: string;
}) {
  if (!item) {
    return <EmptyPane />;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{item.issueTitle}</h2>
            <Badge variant="secondary" size="sm" className="rounded-full border-0 bg-muted/30">
              {item.laneLabel}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.issueKey} / {item.projectName} / {item.updatedLabel.replace('Updated ', '')}
          </p>
        </div>

        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
        >
          <Link href={item.href}>Open</Link>
        </Button>
      </div>

      <Separator className="bg-border/60" />

      <div className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto p-5">
        <div className="max-w-2xl space-y-4">
          <p className="text-sm leading-7 text-foreground">{item.summary}</p>
          {item.detailLines.map((line) => (
            <p key={line} className="text-sm leading-7 text-muted-foreground">
              {line}
            </p>
          ))}
          <p className="text-sm leading-7 text-muted-foreground">
            {userHeadline}&apos;s centralized feed reflecting assigned tasks, subscribed issues, and
            team activity streams.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>{accessibleProjectCount} accessible</span>
          <span>{assignedProjectCount} assigned</span>
          <span>{collaborationProjectCount} shared</span>
          <span>{ownedProjectCount} owned</span>
        </div>
      </div>
    </div>
  );
}

function LaneSection({
  laneLabel,
  items,
  selectedItemId,
  onSelectItem
}: {
  laneLabel: MyWorkInboxLane;
  items: MyWorkInboxItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-border/60 first:border-t-0">
      <div className="flex items-center justify-between bg-muted/[0.14] px-3 py-2">
        <div className="flex items-center gap-2">
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{laneLabel}</span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </div>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          aria-label={`Add item to ${laneLabel}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {items.map((item) => {
        const isSelected = item.id === selectedItemId;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectItem(item.id)}
            className={[
              'grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-t border-border/50 px-3 py-2.5 text-left transition-colors first:border-t-0',
              isSelected ? 'bg-muted/20' : 'hover:bg-muted/10'
            ].join(' ')}
          >
            <span className="text-[11px] text-muted-foreground">{item.issueKey}</span>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="truncate text-sm font-medium text-foreground">
                {item.issueTitle}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{item.relationshipLabel}</span>
                <span className="text-[11px] text-muted-foreground/80">
                  {item.updatedLabel.replace('Updated ', '')}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function MyWorkPageContent({
  accessibleProjectCount,
  assignedProjectCount,
  collaborationProjectCount,
  ownedProjectCount,
  userHeadline,
  canViewProjects,
  assignedIssues,
  recentIssues,
  watchingIssues
}: MyWorkPageContentProps) {
  const inbox = buildMyWorkInboxModel({
    accessibleProjectCount,
    assignedIssues,
    recentIssues,
    watchingIssues
  });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    inbox.allItems[0]?.id ?? null
  );
  const selectedItem =
    inbox.allItems.find((item) => item.id === selectedItemId) ?? inbox.allItems[0] ?? null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <Card
        className={`${enterpriseCardVariants()} flex h-full min-h-0 w-full min-w-0 flex-col rounded-none border-0`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-sm font-semibold text-foreground">Inbox</h1>
            <Badge variant="secondary" size="sm" className="rounded-full border-0 bg-muted/25">
              {inbox.allItems.length} total
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted/20 hover:text-foreground"
              aria-label="Filter inbox"
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted/20 hover:text-foreground"
              aria-label="Inbox display options"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-border/60">
            <div className="border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-2">
                {listTabs.map((tab, index) => (
                  <Badge
                    key={tab}
                    variant={index === 0 ? 'secondary' : 'outline'}
                    size="sm"
                    className={
                      index === 0
                        ? 'rounded-md border-0 bg-muted/30'
                        : 'rounded-md border-border/60 bg-transparent'
                    }
                  >
                    {tab}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {inbox.allItems.length > 0 ? (
                laneOrder.map((laneLabel) => {
                  const items = inbox.allItems.filter((item) => item.laneLabel === laneLabel);
                  return (
                    <LaneSection
                      key={laneLabel}
                      laneLabel={laneLabel}
                      items={items}
                      selectedItemId={selectedItem?.id ?? null}
                      onSelectItem={setSelectedItemId}
                    />
                  );
                })
              ) : (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  No items in this view.
                </div>
              )}
            </div>
          </aside>

          <section className="min-h-0 min-w-0 overflow-hidden">
            <DetailPane
              item={selectedItem}
              accessibleProjectCount={accessibleProjectCount}
              assignedProjectCount={assignedProjectCount}
              collaborationProjectCount={collaborationProjectCount}
              ownedProjectCount={ownedProjectCount}
              userHeadline={userHeadline}
            />
          </section>
        </div>

        <div className="shrink-0 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{accessibleProjectCount} accessible</span>
            <span>{assignedProjectCount} assigned</span>
            <span>{collaborationProjectCount} shared</span>
            <span>{ownedProjectCount} owned</span>
            {!canViewProjects ? <span>Limited access</span> : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

'use client';

import React from 'react';

import type { InboxItem, InboxItemKind } from './inbox-data';

import { Badge } from '~/components/ui/badge';
import { ScrollArea } from '~/components/ui/scroll-area';

type ChannelMeta = Record<
  InboxItemKind,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    iconSurfaceClass: string;
  }
>;

export function InboxListPanel({
  items,
  selectedItemId,
  channelMeta,
  onSelect
}: {
  items: InboxItem[];
  selectedItemId: string;
  channelMeta: ChannelMeta;
  onSelect: (id: string) => void;
}) {
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0];

  if (!selectedItem) {
    return (
      <div className="border-b border-border/70 bg-[hsl(var(--panel-subtle))] xl:border-b-0 xl:border-r">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Inbox</p>
            <p className="text-xs text-muted-foreground">No active items in this queue</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border/70 bg-[hsl(var(--panel-subtle))] xl:border-b-0 xl:border-r">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {channelMeta[selectedItem.kind].label}
          </p>
          <p className="text-xs text-muted-foreground">{items.length} active items in this queue</p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Queue</p>
      </div>

      <ScrollArea className="h-128 xl:h-[calc(100svh-14rem)]">
        <div className="divide-y divide-border/70">
          {items.map((item) => {
            const itemChannel = channelMeta[item.kind];
            const ItemIcon = itemChannel.icon;
            const isSelected = item.id === selectedItemId;

            return (
              <button
                key={item.id}
                type="button"
                className={`w-full px-4 py-4 text-left transition-colors ${
                  isSelected
                    ? 'bg-[hsl(var(--panel))]'
                    : 'bg-[hsl(var(--panel-subtle))] hover:bg-[hsl(var(--panel))]'
                }`}
                onClick={() => onSelect(item.id)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${itemChannel.iconSurfaceClass}`}
                  >
                    <ItemIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[15px] font-medium text-foreground">
                            {item.title}
                          </p>
                          {item.unread ? (
                            <span className="h-2 w-2 rounded-full bg-primary" />
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[15px] leading-7 text-muted-foreground">
                          {item.preview}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                        {item.receivedAt}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-md px-2 py-0.5 text-[10px]">
                        {item.priority}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{item.source}</span>
                      <span className="text-[11px] text-muted-foreground">•</span>
                      <span className="text-[11px] text-muted-foreground">
                        {item.owner} on {item.context}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

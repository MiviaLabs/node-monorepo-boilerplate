'use client';

import { Bell, CircleCheckBig, Filter, ShieldAlert } from 'lucide-react';
import React from 'react';

import { InboxCategoryBar } from './inbox-category-bar';
import { type InboxCategory, InboxCategoryKey, type InboxItem, InboxItemKind } from './inbox-data';
import { InboxDetailPanel } from './inbox-detail-panel';
import { InboxListPanel } from './inbox-list-panel';

import { Tabs } from '~/components/ui/tabs';

const channelMeta = {
  [InboxItemKind.Approval]: {
    icon: CircleCheckBig,
    label: 'Approvals',
    iconSurfaceClass:
      'border-[hsl(var(--primary)/0.18)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]'
  },
  [InboxItemKind.Alert]: {
    icon: ShieldAlert,
    label: 'Alerts',
    iconSurfaceClass:
      'border-[hsl(var(--destructive)/0.18)] bg-[hsl(var(--destructive)/0.08)] text-[hsl(var(--destructive))]'
  },
  [InboxItemKind.Notification]: {
    icon: Bell,
    label: 'Notifications',
    iconSurfaceClass:
      'border-[hsl(var(--chart-2)/0.2)] bg-[hsl(var(--chart-2)/0.1)] text-[hsl(var(--chart-2))]'
  },
  [InboxItemKind.Digest]: {
    icon: Filter,
    label: 'Digests',
    iconSurfaceClass:
      'border-[hsl(var(--chart-4)/0.2)] bg-[hsl(var(--chart-4)/0.12)] text-[hsl(var(--chart-4))]'
  }
} as const;

export function InboxPageClient({
  categories,
  groups,
  initialSelection
}: {
  categories: InboxCategory[];
  groups: Record<InboxCategoryKey, InboxItem[]>;
  initialSelection: Record<InboxCategoryKey, string>;
}) {
  const [activeTab, setActiveTab] = React.useState<InboxCategoryKey>(InboxCategoryKey.All);
  const [selectedByTab, setSelectedByTab] =
    React.useState<Record<InboxCategoryKey, string>>(initialSelection);
  const [detailsOpen, setDetailsOpen] = React.useState(true);

  const items = groups[activeTab];
  const selectedItem =
    items.find((item) => item.id === selectedByTab[activeTab]) ?? items[0] ?? null;

  if (!selectedItem) {
    return null;
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as InboxCategoryKey)}
      className="space-y-0"
    >
      <InboxCategoryBar categories={categories} groups={groups} />
      <div className="grid min-h-[calc(100svh-9.5rem)] gap-0 overflow-hidden bg-[hsl(var(--panel))] xl:grid-cols-[430px_minmax(0,1fr)]">
        <InboxListPanel
          items={items}
          selectedItemId={selectedItem.id}
          channelMeta={channelMeta}
          onSelect={(id) =>
            setSelectedByTab((current) => ({
              ...current,
              [activeTab]: id
            }))
          }
        />
        <InboxDetailPanel
          item={selectedItem}
          channelMeta={channelMeta}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((current) => !current)}
        />
      </div>
    </Tabs>
  );
}

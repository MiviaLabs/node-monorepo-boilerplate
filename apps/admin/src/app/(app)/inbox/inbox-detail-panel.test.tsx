import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { InboxDetailPanel } from './inbox-detail-panel';
import { InboxItemKind, InboxPriority, type InboxItem } from './inbox-data';

const channelMeta = {
  [InboxItemKind.Approval]: {
    icon: () => null,
    label: 'Approvals',
    iconSurfaceClass: 'border-primary/20 bg-primary/10 text-primary'
  },
  [InboxItemKind.Alert]: {
    icon: () => null,
    label: 'Alerts',
    iconSurfaceClass: 'border-destructive/20 bg-destructive/10 text-destructive'
  },
  [InboxItemKind.Notification]: {
    icon: () => null,
    label: 'Notifications',
    iconSurfaceClass: 'border-chart-2/20 bg-chart-2/10 text-chart-2'
  },
  [InboxItemKind.Digest]: {
    icon: () => null,
    label: 'Digests',
    iconSurfaceClass: 'border-chart-4/20 bg-chart-4/10 text-chart-4'
  }
} as const;

const inboxItem: InboxItem = {
  id: 'policy-bundle-approval',
  title: 'Policy bundle approval required',
  preview: 'Security is waiting on final approval for `prod-2026.03.13.1`.',
  body: ['First line', 'Second line'],
  kind: InboxItemKind.Approval,
  source: 'Policy publish',
  owner: 'Security',
  context: 'Production access policies',
  receivedAt: '4m ago',
  href: '/health',
  actionLabel: 'Review bundle',
  priority: InboxPriority.High,
  unread: true
};

describe('InboxDetailPanel', () => {
  it('renders the details rail when expanded', () => {
    const html = renderToStaticMarkup(
      <InboxDetailPanel
        item={inboxItem}
        channelMeta={channelMeta}
        detailsOpen
        onToggleDetails={() => {}}
      />
    );

    expect(html).toContain('Hide details');
    expect(html).toContain('Details');
    expect(html).toContain('Production access policies');
    expect(html).toContain('Open related page');
  });

  it('omits the details rail when collapsed', () => {
    const html = renderToStaticMarkup(
      <InboxDetailPanel
        item={inboxItem}
        channelMeta={channelMeta}
        detailsOpen={false}
        onToggleDetails={() => {}}
      />
    );

    expect(html).toContain('Show details');
    expect(html).not.toContain('Open related page');
    expect(html).toContain('Recommended next step');
  });
});

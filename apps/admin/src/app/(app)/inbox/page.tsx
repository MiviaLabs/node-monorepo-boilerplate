import React from 'react';

import { buildInboxGroups, buildInitialSelection, inboxCategories } from './inbox-data';
import { InboxPageClient } from './inbox-page-client';

import { AppPage, AppPageWidth } from '~/components/app-shell/app-page';

export default function InboxPage() {
  const groups = buildInboxGroups();
  const initialSelection = buildInitialSelection(groups);

  return (
    <AppPage width={AppPageWidth.Edge} className="-mt-4 overflow-x-hidden sm:-mt-6">
      <InboxPageClient
        categories={inboxCategories}
        groups={groups}
        initialSelection={initialSelection}
      />
    </AppPage>
  );
}

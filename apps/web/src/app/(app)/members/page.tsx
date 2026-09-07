import { Suspense } from 'react';

import type { User } from '~/types/auth.types';

import { MembersPageContent } from '~/components/members/members-page-content';
import { MembersTableSkeleton } from '~/components/tenant/members-table-skeleton';
import { getUserSession } from '~/lib/auth/get-user-session';
import {
  getPhase0RouteBudgetAttributes,
  measurePhase0
} from '~/lib/diagnostics/phase-zero-diagnostics';
import {
  DEFAULT_MEMBERS_PAGE,
  DEFAULT_MEMBERS_PAGE_SIZE,
  parseMembersQueryParams,
  type MembersQueryState
} from '~/lib/members/members-query-params';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';
import { createServerTrpcClient } from '~/lib/trpc/create-server-trpc-client';

const DEFAULT_PAGE_SIZE = DEFAULT_MEMBERS_PAGE_SIZE;
export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.MEMBERS);

async function MembersData({ user, queryInput }: { user: User; queryInput: MembersQueryState }) {
  return measurePhase0(
    'web.page.members.loader',
    {
      page: '/members',
      ...getPhase0RouteBudgetAttributes('/members')
    },
    async () => {
      const trpcClient = await createServerTrpcClient();
      const { data: members, meta } = await trpcClient.members.getMembers.query(queryInput);

      return (
        <MembersPageContent
          initialData={members}
          initialMeta={meta}
          initialQueryInput={queryInput}
          user={user}
        />
      );
    }
  );
}

export default async function MembersPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await getUserSession();
  const resolvedSearchParams = (await searchParams) ?? {};
  const queryInput = parseMembersQueryParams(resolvedSearchParams, {
    page: DEFAULT_MEMBERS_PAGE,
    pageSize: DEFAULT_PAGE_SIZE
  });

  return (
    <div className="w-full">
      <Suspense fallback={<MembersTableSkeleton />}>
        <MembersData user={user} queryInput={queryInput} />
      </Suspense>
    </div>
  );
}

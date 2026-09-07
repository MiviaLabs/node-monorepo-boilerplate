import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { MyWorkPageContent } from '~/components/my-work/my-work-page-content';
import { MyWorkIssueRelationship, type MyWorkIssueEntry } from '~/components/my-work/my-work-types';
import { getUserSession } from '~/lib/auth/get-user-session';
import {
  getPhase0RouteBudgetAttributes,
  measurePhase0
} from '~/lib/diagnostics/phase-zero-diagnostics';
import { getMyWorkPageData } from '~/lib/issues/get-issues';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.MY_WORK);

export default async function MyWorkPage() {
  return measurePhase0(
    'web.page.my_work.loader',
    {
      page: '/my',
      ...getPhase0RouteBudgetAttributes('/my')
    },
    async () => {
      const { user } = await getUserSession();
      const trimmedDisplayName = user.displayName?.trim();
      const userHeadline =
        trimmedDisplayName && trimmedDisplayName.length > 0 ? trimmedDisplayName : user.email;
      const { canViewProjects } = getDashboardRouteAccess({
        roles: user.roles,
        permissions: user.permissions
      });
      const {
        assignedIssues,
        assignedIssueCount,
        watchingIssues,
        recentIssues: recentVisibleIssues,
        accessibleProjectCount,
        ownedProjectCount,
        collaborationProjectCount
      } = await getMyWorkPageData();

      const toEntry = (
        issue: (typeof assignedIssues)[number],
        relationshipLabel: MyWorkIssueRelationship
      ): MyWorkIssueEntry => ({
        issue,
        relationshipLabel
      });

      const assignedIssueEntries = assignedIssues.map((issue) =>
        toEntry(issue, MyWorkIssueRelationship.ASSIGNED)
      );
      const assignedIssueIds = new Set(assignedIssues.map((issue) => issue.id));
      const watchingIssueEntries = watchingIssues
        .filter((issue) => !assignedIssueIds.has(issue.id))
        .map((issue) => toEntry(issue, MyWorkIssueRelationship.WATCHING));
      const activeIssueIds = new Set([
        ...assignedIssues.map((issue) => issue.id),
        ...watchingIssueEntries.map((entry) => entry.issue.id)
      ]);
      const recentIssueEntries = recentVisibleIssues
        .filter((issue) => !activeIssueIds.has(issue.id))
        .slice(0, 10)
        .map((issue) => toEntry(issue, MyWorkIssueRelationship.RECENT));

      return (
        <MyWorkPageContent
          accessibleProjectCount={accessibleProjectCount}
          assignedProjectCount={assignedIssueCount}
          collaborationProjectCount={collaborationProjectCount}
          ownedProjectCount={ownedProjectCount}
          userHeadline={userHeadline}
          canViewProjects={canViewProjects}
          assignedIssues={assignedIssueEntries}
          recentIssues={recentIssueEntries}
          watchingIssues={watchingIssueEntries}
        />
      );
    }
  );
}

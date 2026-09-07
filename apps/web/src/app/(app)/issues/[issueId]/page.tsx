import { notFound } from 'next/navigation';

import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { ProjectIssueDetailPageContent } from '~/components/projects/project-issues-page-content';
import { getUserSession } from '~/lib/auth/get-user-session';
import {
  getPhase0ApiTargetAttributes,
  getPhase0RouteBudgetAttributes,
  measurePhase0
} from '~/lib/diagnostics/phase-zero-diagnostics';
import { IssueFetchError, getIssuePageData } from '~/lib/issues/get-issues';
import { mapIssueDetailProject, mapIssueToPreview } from '~/lib/issues/issue-view-models';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';
import {
  buildProjectIssuesDetailHrefs,
  parseProjectIssuesQueryParams
} from '~/lib/projects/project-issues-query-params';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default async function IssueDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ issueId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { issueId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { user } = await getUserSession();
  const { canCreateIssues, canDeleteIssues, canUpdateIssues } = getDashboardRouteAccess({
    roles: user.roles,
    permissions: user.permissions
  });

  try {
    return await measurePhase0(
      'web.page.issue_detail.loader',
      {
        page: '/issues/[issueId]',
        ...getPhase0RouteBudgetAttributes('/issues/[issueId]'),
        ...getPhase0ApiTargetAttributes(getVersionedApiBaseUrl('v1'))
      },
      async () => {
        const { issue, attachments, labels, members, relationCandidates } =
          await getIssuePageData(issueId);
        const project = mapIssueDetailProject(issue, new Map());
        const preview = mapIssueToPreview(issue, {
          members
        });
        const queryState = parseProjectIssuesQueryParams(resolvedSearchParams ?? {});
        const { listHref, issueHref } = buildProjectIssuesDetailHrefs(queryState, preview.id);

        return (
          <ProjectIssueDetailPageContent
            relationCandidates={relationCandidates}
            canCreateIssue={canCreateIssues}
            canDeleteIssue={canDeleteIssues}
            canCreateComment={canUpdateIssues}
            canUpdateIssue={canUpdateIssues}
            availableLabels={labels}
            initialAttachments={attachments}
            initialComments={issue.comments}
            initialLabels={issue.labels}
            initialActivity={issue.activity}
            initialRelations={issue.relations}
            initialSubtasks={issue.subtasks}
            initialWatchers={issue.watchers}
            currentUserId={Number(user.userId)}
            issue={preview}
            members={members}
            project={project}
            listHref={listHref}
            issueHref={issueHref}
          />
        );
      }
    );
  } catch (error) {
    if (error instanceof IssueFetchError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}

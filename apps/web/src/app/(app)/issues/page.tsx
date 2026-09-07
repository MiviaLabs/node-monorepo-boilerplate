import type { ProjectMember } from '~/types/project.types';

import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import {
  WorkspaceIssuesPageContent,
  type WorkspaceIssueRecord
} from '~/components/issues/workspace-issues-page-content';
import { getUserSession } from '~/lib/auth/get-user-session';
import {
  getPhase0RouteBudgetAttributes,
  measurePhase0
} from '~/lib/diagnostics/phase-zero-diagnostics';
import { getWorkspaceIssuesPageData } from '~/lib/issues/get-issues';
import { resolveIssueAssigneeCandidates } from '~/lib/issues/issue-assignee-candidates';
import { mapIssueToWorkspaceRecord } from '~/lib/issues/issue-view-models';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';
export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default async function IssuesPage() {
  return measurePhase0(
    'web.page.issues.loader',
    {
      page: '/issues',
      ...getPhase0RouteBudgetAttributes('/issues')
    },
    async () => {
      const { user } = await getUserSession();
      const { canCreateIssues, canDeleteIssues, canUpdateIssues } = getDashboardRouteAccess({
        roles: user.roles,
        permissions: user.permissions
      });
      const currentUserLabel = user.displayName?.trim() ?? user.email;
      const { issues, labels, projects, organizationMembers, privateProjectMembersByProjectId } =
        await getWorkspaceIssuesPageData();
      const issueList = issues.data;
      const projectLookup = new Map(projects.map((project) => [project.id, project]));
      const projectMembersLookup = new Map<string, ProjectMember[]>(
        Object.entries(privateProjectMembersByProjectId)
      );
      const issueRecords: WorkspaceIssueRecord[] = issueList.map((issue) =>
        mapIssueToWorkspaceRecord(issue, {
          projectLookup,
          members: resolveIssueAssigneeCandidates(
            issue.project?.visibility ??
              (issue.projectId !== null
                ? projectLookup.get(String(issue.projectId))?.visibility
                : null),
            organizationMembers,
            issue.projectId === null
              ? []
              : (projectMembersLookup.get(String(issue.projectId)) ?? [])
          )
        })
      );

      return (
        <WorkspaceIssuesPageContent
          availableLabels={labels}
          canCreateIssues={canCreateIssues}
          canDeleteIssues={canDeleteIssues}
          canUpdateIssues={canUpdateIssues}
          currentUserId={Number(user.userId)}
          currentUserLabel={currentUserLabel}
          issueRecords={issueRecords}
          projects={projects}
          storageScope={user.tenantId}
        />
      );
    }
  );
}

import { getAuthorizedProjectPageData } from './project-page-data';

import { ProjectOverviewPageContent } from '~/components/projects/project-overview-page-content';
import { getIssuesSummary } from '~/lib/issues/get-issues';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default async function ProjectDetailsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { canViewProjectMembers, members, project, user } =
    await getAuthorizedProjectPageData(projectId);
  const issueSummary = await getIssuesSummary({ projectId: Number(projectId) });

  return (
    <ProjectOverviewPageContent
      canViewProjectMembers={canViewProjectMembers}
      initialIssueSummary={issueSummary}
      initialMembers={members}
      initialProject={project}
      user={user}
    />
  );
}

import { redirect } from 'next/navigation';

import { getAuthorizedProjectData } from '../project-page-data';

import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { ProjectContentPageContent } from '~/components/projects/project-content-page-content';
import { getFirstProjectContentSidebarEntry } from '~/lib/content/get-content';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default async function ProjectContentPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { project, user } = await getAuthorizedProjectData(projectId);
  const parsedProjectId = Number.parseInt(projectId, 10);
  const firstPage = Number.isNaN(parsedProjectId)
    ? null
    : await getFirstProjectContentSidebarEntry(parsedProjectId);
  const access = getDashboardRouteAccess({
    roles: user.roles,
    permissions: user.permissions
  });

  if (firstPage) {
    redirect(`/projects/${projectId}/content/${firstPage.slug}`);
  }

  return (
    <ProjectContentPageContent
      canEdit={access.canUpdateContent}
      canDelete={access.canDeleteContent}
      pages={[]}
      project={project}
    />
  );
}

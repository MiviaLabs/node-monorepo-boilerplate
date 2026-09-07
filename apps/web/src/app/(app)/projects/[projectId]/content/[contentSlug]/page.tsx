import { notFound } from 'next/navigation';

import { getAuthorizedProjectData } from '../../project-page-data';

import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { ProjectContentPageContent } from '~/components/projects/project-content-page-content';
import { ContentFetchError, getProjectContentPageBySlug } from '~/lib/content/get-content';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default async function ProjectContentDocumentPage({
  params
}: {
  params: Promise<{ projectId: string; contentSlug: string }>;
}) {
  const { projectId, contentSlug } = await params;
  const parsedProjectId = Number.parseInt(projectId, 10);
  if (Number.isNaN(parsedProjectId)) {
    notFound();
  }

  const { project, user } = await getAuthorizedProjectData(projectId);
  const access = getDashboardRouteAccess({
    roles: user.roles,
    permissions: user.permissions
  });
  let pages;

  try {
    pages = await getProjectContentPageBySlug(parsedProjectId, contentSlug);
  } catch (error) {
    if (error instanceof ContentFetchError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  return (
    <ProjectContentPageContent
      canEdit={access.canUpdateContent}
      canDelete={access.canDeleteContent}
      pages={pages}
      project={project}
      selectedPageSlug={contentSlug}
    />
  );
}

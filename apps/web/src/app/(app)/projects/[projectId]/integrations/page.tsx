import { getAuthorizedProjectPageData } from '../project-page-data';

import { ProjectIntegrationsPageContent } from '~/components/projects/project-integrations-page-content';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default async function ProjectIntegrationsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { members, project } = await getAuthorizedProjectPageData(projectId);

  return <ProjectIntegrationsPageContent members={members} project={project} />;
}

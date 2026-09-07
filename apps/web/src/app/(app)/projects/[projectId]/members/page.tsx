import { getAuthorizedProjectPageData } from '../project-page-data';

import { ProjectMembersPageContent } from '~/components/projects/project-members-page-content';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default async function ProjectMembersPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { members, project } = await getAuthorizedProjectPageData(projectId);

  return <ProjectMembersPageContent members={members} project={project} />;
}

import { getAuthorizedProjectPageData } from '../project-page-data';

import { ProjectSettingsPageContent } from '~/components/projects/project-settings-page-content';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default async function ProjectSettingsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { canViewProjectMembers, members, project, user } =
    await getAuthorizedProjectPageData(projectId);

  return (
    <ProjectSettingsPageContent
      canViewProjectMembers={canViewProjectMembers}
      initialMembers={members}
      initialProject={project}
      user={user}
    />
  );
}

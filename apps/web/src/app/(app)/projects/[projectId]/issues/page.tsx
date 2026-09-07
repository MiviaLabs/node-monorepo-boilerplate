import { redirect } from 'next/navigation';

import { getAuthorizedProjectData } from '../project-page-data';

import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default async function ProjectIssuesPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await getAuthorizedProjectData(projectId);

  redirect(`/issues?projectId=${encodeURIComponent(projectId)}`);
}

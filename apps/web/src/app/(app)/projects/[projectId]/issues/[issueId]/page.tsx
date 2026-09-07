import { redirect } from 'next/navigation';

import { getAuthorizedProjectData } from '../../project-page-data';

import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default async function ProjectIssueDetailPage({
  params
}: {
  params: Promise<{ issueId: string; projectId: string }>;
}) {
  const { issueId, projectId } = await params;
  await getAuthorizedProjectData(projectId);

  redirect(`/issues/${encodeURIComponent(issueId)}?projectId=${encodeURIComponent(projectId)}`);
}

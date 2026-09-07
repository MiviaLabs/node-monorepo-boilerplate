import { redirect } from 'next/navigation';

import type { ProjectMember } from '~/types/project.types';

import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { getUserSession } from '~/lib/auth/get-user-session';
import { ProjectContextNotice } from '~/lib/projects/project-context-notice';
import { createServerTrpcClient } from '~/lib/trpc/create-server-trpc-client';
import { isHandledTrpcAccessError } from '~/lib/trpc/errors';

async function getAuthorizedProjectContext() {
  const { user } = await getUserSession();
  const { canViewProjects } = getDashboardRouteAccess({
    roles: user.roles,
    permissions: user.permissions
  });

  if (!canViewProjects) {
    redirect('/dashboard');
  }

  return {
    trpcClient: await createServerTrpcClient(),
    user
  };
}

export async function getAuthorizedProjectData(projectId: string) {
  const { trpcClient, user } = await getAuthorizedProjectContext();

  try {
    const project = await trpcClient.projects.get.query({ projectId });
    return { project, user };
  } catch (error) {
    if (isHandledTrpcAccessError(error)) {
      redirect(`/projects?projectContext=${ProjectContextNotice.UNAVAILABLE}`);
    }

    throw error;
  }
}

export async function getAuthorizedProjectPageData(projectId: string) {
  const { trpcClient, user } = await getAuthorizedProjectContext();

  try {
    const project = await trpcClient.projects.get.query({ projectId });
    let members: ProjectMember[] = [];
    let canViewProjectMembers = true;

    try {
      members = await trpcClient.projects.listMembers.query({ projectId });
    } catch (error) {
      if (isHandledTrpcAccessError(error)) {
        canViewProjectMembers = false;
      } else {
        throw error;
      }
    }

    return { canViewProjectMembers, members, project, user };
  } catch (error) {
    if (isHandledTrpcAccessError(error)) {
      redirect(`/projects?projectContext=${ProjectContextNotice.UNAVAILABLE}`);
    }

    throw error;
  }
}

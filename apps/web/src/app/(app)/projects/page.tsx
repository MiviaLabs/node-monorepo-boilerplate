import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import type { User } from '~/types/auth.types';
import type { ProjectsQueryInput } from '~/types/project.types';

import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { ProjectsPageContent } from '~/components/projects/projects-page-content';
import { Card, CardContent } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { getUserSession } from '~/lib/auth/get-user-session';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';
import {
  parseProjectContextNotice,
  type ProjectContextNotice
} from '~/lib/projects/project-context-notice';
import {
  DEFAULT_PROJECTS_PAGE,
  DEFAULT_PROJECTS_PAGE_SIZE,
  parseProjectsQueryParams
} from '~/lib/projects/projects-query-params';
import { createServerTrpcClient } from '~/lib/trpc/create-server-trpc-client';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

async function ProjectsData({
  user,
  queryInput,
  projectContextNotice
}: {
  user: User;
  queryInput: ProjectsQueryInput;
  projectContextNotice?: ProjectContextNotice;
}) {
  const trpcClient = await createServerTrpcClient();
  const { data, meta } = await trpcClient.projects.list.query(queryInput);

  return (
    <ProjectsPageContent
      initialData={data}
      initialMeta={meta}
      initialQueryInput={queryInput}
      projectContextNotice={projectContextNotice}
      user={user}
    />
  );
}

function ProjectsPageSkeleton() {
  return (
    <div className="w-full space-y-4">
      {[0, 1, 2].map((index) => (
        <Card key={index} className={enterpriseCardVariants()}>
          <CardContent className="h-28 animate-pulse bg-muted/20" />
        </Card>
      ))}
    </div>
  );
}

export default async function ProjectsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await getUserSession();
  const { canViewProjects } = getDashboardRouteAccess({
    roles: user.roles,
    permissions: user.permissions
  });

  if (!canViewProjects) {
    redirect('/dashboard');
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const queryInput = parseProjectsQueryParams(resolvedSearchParams, {
    page: DEFAULT_PROJECTS_PAGE,
    pageSize: DEFAULT_PROJECTS_PAGE_SIZE
  });
  const projectContextNotice = parseProjectContextNotice(resolvedSearchParams['projectContext']);

  return (
    <Suspense fallback={<ProjectsPageSkeleton />}>
      <ProjectsData
        user={user}
        queryInput={queryInput}
        projectContextNotice={projectContextNotice}
      />
    </Suspense>
  );
}

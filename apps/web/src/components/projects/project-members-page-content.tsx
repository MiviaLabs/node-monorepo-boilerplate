'use client';

import { ArrowLeft, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import type { Project, ProjectMember } from '~/types/project.types';

import { ProjectMembersTable } from '~/components/projects/project-members-table';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { WorkspaceStat } from '~/components/ui/workspace-stat';
import { getProjectMembersSummary } from '~/lib/projects/project-members';

interface ProjectMembersPageContentProps {
  members: ProjectMember[];
  project: Project;
}

export function ProjectMembersPageContent({ members, project }: ProjectMembersPageContentProps) {
  const memberSummary = useMemo(() => getProjectMembersSummary(members), [members]);

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild type="button" variant="outline">
          <Link href={`/projects/${project.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to project
          </Link>
        </Button>

        <Button asChild type="button" variant="outline">
          <Link href={`/projects/${project.id}`}>
            <Settings className="h-4 w-4" />
            Project details
          </Link>
        </Button>
      </div>

      <Card className={enterpriseCardVariants()}>
        <CardHeader>
          <CardTitle>Project Members</CardTitle>
          <CardDescription>
            Review who has access to {project.name}. Add and remove actions stay under project
            details.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <WorkspaceStat
            label="Members"
            value={memberSummary.total}
            icon={Users}
            iconClassName="bg-violet-500/10 text-violet-600 ring-violet-500/20 group-hover:bg-violet-500/15 dark:text-violet-400"
          />
          <WorkspaceStat
            label="Collaborators"
            value={memberSummary.collaborators}
            icon={Users}
            iconClassName="bg-orange-500/10 text-orange-600 ring-orange-500/20 group-hover:bg-orange-500/15 dark:text-orange-400"
          />
          <WorkspaceStat
            label="Creators"
            value={memberSummary.creators}
            icon={Users}
            iconClassName="bg-blue-500/10 text-blue-600 ring-blue-500/20 group-hover:bg-blue-500/15 dark:text-blue-400"
          />
        </CardContent>
      </Card>

      <Card className={enterpriseCardVariants()}>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
          <CardDescription>
            This view is read-only by design so the primary project entry stays focused and the
            management workflow stays in the project details page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectMembersTable members={members} projectId={project.id} canManageProject={false} />
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  FolderKanban,
  Globe,
  Lock,
  PlugZap,
  Puzzle,
  Settings,
  ShieldCheck,
  Users
} from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { getProjectWorkspacePreview } from './project-module-preview-data';
import { formatProjectDate, getProjectCreatorLabel } from './project-page-helpers';

import type { User } from '~/types/auth.types';
import type { IssuesSummary } from '~/types/issue.types';
import type { Project, ProjectMember } from '~/types/project.types';

import { ProjectMembersTable } from '~/components/projects/project-members-table';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { WorkspaceStat } from '~/components/ui/workspace-stat';
import { getProjectMembersSummary } from '~/lib/projects/project-members';
import { PROJECT_VISIBILITY, PROJECT_VISIBILITY_LABELS } from '~/types/project.types';

interface ProjectOverviewPageContentProps {
  canViewProjectMembers: boolean;
  initialIssueSummary?: IssuesSummary;
  initialMembers: ProjectMember[];
  initialProject: Project;
  user: User;
}

export function ProjectOverviewPageContent({
  canViewProjectMembers,
  initialIssueSummary,
  initialMembers,
  initialProject,
  user
}: ProjectOverviewPageContentProps) {
  const project = initialProject;
  const projectMembers = initialMembers;
  const memberSummary = useMemo(() => getProjectMembersSummary(projectMembers), [projectMembers]);
  const projectCreatorLabel = useMemo(
    () => getProjectCreatorLabel(project, projectMembers),
    [project, projectMembers]
  );
  const trimmedUserDisplayName = user.displayName?.trim();
  const currentUserLabel =
    trimmedUserDisplayName && trimmedUserDisplayName.length > 0
      ? trimmedUserDisplayName
      : user.email;
  const workspacePreview = useMemo(
    () => getProjectWorkspacePreview(project, projectMembers),
    [project, projectMembers]
  );
  const issueSummary = initialIssueSummary ?? {
    total: 0,
    backlog: 0,
    inProgress: 0,
    blocked: 0,
    done: 0,
    open: 0
  };
  const visibleMembers = projectMembers.slice(0, 5);
  const remainingMembers = Math.max(0, projectMembers.length - visibleMembers.length);
  const overviewModules = [
    {
      title: 'Issues',
      description: 'Track work, priorities, and delivery state for this project.',
      href: `/issues?projectId=${project.id}`,
      metricLabel: `${issueSummary.open} open / ${issueSummary.inProgress} active`,
      icon: FolderKanban
    },
    {
      title: 'Content',
      description: 'Centralize notes, decisions, and project-specific knowledge.',
      href: `/projects/${project.id}/content`,
      metricLabel: `${workspacePreview.content.pageCount} pages / ${workspacePreview.content.reviewQueue} in review`,
      icon: BookOpenText
    },
    {
      title: 'Integrations',
      description: 'Connect project tools, automations, and external systems.',
      href: `/projects/${project.id}/integrations`,
      metricLabel: `${workspacePreview.integrations.connected} connected / ${workspacePreview.integrations.attentionNeeded} attention`,
      icon: PlugZap
    }
  ] as const;

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild type="button" variant="outline">
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>
        </Button>

        <Button asChild type="button" variant="outline">
          <Link href={`/projects/${project.id}/settings`}>
            <Settings className="h-4 w-4" />
            Project settings
          </Link>
        </Button>
      </div>

      <Card className={enterpriseCardVariants()}>
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <CardTitle>Project Overview</CardTitle>
            <CardDescription>
              The primary entry point for this project. Review the current scope, access, and the
              next modules that will grow into the project workspace.
            </CardDescription>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>{project.name}</span>
              <span>/</span>
              <span className="font-mono">{project.key}</span>
              <span>/</span>
              <span>Project ID {project.id}</span>
            </div>
          </div>
          <div className="rounded-full border border-border/40 bg-secondary/20 px-3 py-1 text-[11px] font-medium text-muted-foreground/80">
            Project overview is up to date
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <WorkspaceStat
            label="Visibility"
            value={PROJECT_VISIBILITY_LABELS[project.visibility]}
            icon={project.visibility === PROJECT_VISIBILITY.PRIVATE ? Lock : Globe}
            iconClassName={
              project.visibility === PROJECT_VISIBILITY.PRIVATE
                ? 'bg-amber-500/10 text-amber-600 ring-amber-500/20 group-hover:bg-amber-500/15 dark:text-amber-400'
                : 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 group-hover:bg-emerald-500/15 dark:text-emerald-400'
            }
          />
          <WorkspaceStat
            label="Created By"
            value={projectCreatorLabel}
            icon={FolderKanban}
            iconClassName="bg-blue-500/10 text-blue-600 ring-blue-500/20 group-hover:bg-blue-500/15 dark:text-blue-400"
          />
          <WorkspaceStat
            label="Members"
            value={memberSummary.total}
            icon={Users}
            iconClassName="bg-violet-500/10 text-violet-600 ring-violet-500/20 group-hover:bg-violet-500/15 dark:text-violet-400"
          />
          <WorkspaceStat
            label="Collaborators"
            value={memberSummary.collaborators}
            icon={Puzzle}
            iconClassName="bg-orange-500/10 text-orange-600 ring-orange-500/20 group-hover:bg-orange-500/15 dark:text-orange-400"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <Card className={enterpriseCardVariants()}>
          <CardHeader>
            <CardTitle>Workspace Modules</CardTitle>
            <CardDescription>
              These modules now anchor the day-to-day project workspace. They use explicit preview
              data until dedicated backends exist for issues, content, and integrations.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {overviewModules.map((module) => (
              <div
                key={module.title}
                className="rounded-xl border border-border/70 bg-muted/20 p-4"
              >
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <module.icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{module.title}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{module.description}</p>
                <div className="mt-4 rounded-full border border-border/50 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {module.metricLabel}
                </div>
                <Button asChild variant="outline" size="sm" className="mt-4 w-full justify-between">
                  <Link href={module.href}>
                    Open {module.title}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className={enterpriseCardVariants()}>
          <CardHeader>
            <CardTitle>Project Snapshot</CardTitle>
            <CardDescription>
              Quick reference for metadata and current access shape.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Project key
              </p>
              <p className="font-mono text-foreground">{project.key}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Created
              </p>
              <p className="text-foreground">{formatProjectDate(project.createdAt)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Updated
              </p>
              <p className="text-foreground">{formatProjectDate(project.updatedAt)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Workspace status
              </p>
              <div className="mt-2 flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Project shell is live with preview module data</span>
              </div>
            </div>
            {canViewProjectMembers ? (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Recent members
                </p>
                <div className="mt-2 space-y-2">
                  {visibleMembers.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-3 py-2"
                    >
                      <span className="truncate text-foreground">
                        {(() => {
                          const trimmedMemberName = member.displayName?.trim();
                          return trimmedMemberName && trimmedMemberName.length > 0
                            ? trimmedMemberName
                            : `User ${member.userId}`;
                        })()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {member.isCreator ? 'Creator' : 'Member'}
                      </span>
                    </div>
                  ))}
                  {remainingMembers > 0 ? (
                    <div className="text-xs text-muted-foreground">
                      +{remainingMembers} more member{remainingMembers === 1 ? '' : 's'}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Member roster
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Project membership is restricted by policy for this workspace role.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {canViewProjectMembers ? (
        <Card className={enterpriseCardVariants()}>
          <CardHeader>
            <CardTitle>Current Members</CardTitle>
            <CardDescription>
              Member access stays visible on the overview, while add, remove, and project-level
              management live under project settings. {currentUserLabel} can use settings when
              project administration is needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectMembersTable
              members={projectMembers}
              projectId={project.id}
              canManageProject={false}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

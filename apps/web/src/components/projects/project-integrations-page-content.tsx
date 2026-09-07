'use client';

import { AlertCircle, Cable, FolderKanban, PlugZap } from 'lucide-react';

import {
  getProjectWorkspacePreview,
  ProjectIntegrationStatus
} from './project-module-preview-data';

import type { Project, ProjectMember } from '~/types/project.types';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { WorkspaceStat } from '~/components/ui/workspace-stat';

interface ProjectIntegrationsPageContentProps {
  members: ProjectMember[];
  project: Project;
}

function getIntegrationStatusClass(status: ProjectIntegrationStatus): string {
  if (status === ProjectIntegrationStatus.ACTION_NEEDED) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  if (status === ProjectIntegrationStatus.CONNECTED) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function ProjectIntegrationsPageContent({
  members,
  project
}: ProjectIntegrationsPageContentProps) {
  const preview = getProjectWorkspacePreview(project, members);

  return (
    <div className="w-full space-y-5">
      <Card className={enterpriseCardVariants()}>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connected tools, automation hooks, and external sync points for {project.name}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <WorkspaceStat
            label="Connected"
            value={preview.integrations.connected}
            icon={PlugZap}
            iconClassName="bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 group-hover:bg-emerald-500/15 dark:text-emerald-400"
          />
          <WorkspaceStat
            label="Needs Attention"
            value={preview.integrations.attentionNeeded}
            icon={AlertCircle}
            iconClassName="bg-amber-500/10 text-amber-600 ring-amber-500/20 group-hover:bg-amber-500/15 dark:text-amber-400"
          />
          <WorkspaceStat
            label="Planned"
            value={preview.integrations.planned}
            icon={Cable}
            iconClassName="bg-slate-500/10 text-slate-600 ring-slate-500/20 group-hover:bg-slate-500/15 dark:text-slate-400"
          />
          <WorkspaceStat
            label="Project"
            value={project.name}
            icon={FolderKanban}
            iconClassName="bg-blue-500/10 text-blue-600 ring-blue-500/20 group-hover:bg-blue-500/15 dark:text-blue-400"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <Card className={enterpriseCardVariants()}>
          <CardHeader>
            <CardTitle>Integration Inventory</CardTitle>
            <CardDescription>
              The high-level connection points this project workspace expects to expose.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.integrations.items.map((integration) => (
              <div
                key={integration.title}
                className="rounded-xl border border-border/70 bg-muted/15 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{integration.title}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${getIntegrationStatusClass(integration.status)}`}
                  >
                    {integration.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {integration.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className={enterpriseCardVariants()}>
          <CardHeader>
            <CardTitle>Automation Intent</CardTitle>
            <CardDescription>
              The kind of workflows this module should own once real connectors exist.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
              <p className="font-medium text-foreground">Notification routing</p>
              <p className="mt-2 text-muted-foreground">
                Push major project changes to the right people and channels.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
              <p className="font-medium text-foreground">Workflow sync</p>
              <p className="mt-2 text-muted-foreground">
                Keep downstream systems aligned with project status changes.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
              <p className="font-medium text-foreground">Knowledge publishing</p>
              <p className="mt-2 text-muted-foreground">
                Share approved documents and summaries outside the project workspace.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

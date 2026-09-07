import type { ProjectIssuesPreview } from '~/lib/issues/issue-preview-data';
import type { Project, ProjectMember } from '~/types/project.types';

import { getProjectIssuesPreview } from '~/lib/issues/issue-preview-data';

export const enum ProjectIntegrationStatus {
  CONNECTED = 'Connected',
  ACTION_NEEDED = 'Action needed',
  PLANNED = 'Planned'
}

export interface ProjectContentPreview {
  title: string;
  description: string;
  updatedLabel: string;
}

export interface ProjectIntegrationPreview {
  title: string;
  description: string;
  status: ProjectIntegrationStatus;
}

export interface ProjectWorkspacePreview {
  issues: ProjectIssuesPreview;
  content: {
    pageCount: number;
    recentUpdates: number;
    reviewQueue: number;
    items: ProjectContentPreview[];
  };
  integrations: {
    connected: number;
    attentionNeeded: number;
    planned: number;
    items: ProjectIntegrationPreview[];
  };
}

export function getProjectWorkspacePreview(
  project: Project,
  members: ProjectMember[]
): ProjectWorkspacePreview {
  const memberCount = Math.max(members.length, 1);
  const seed = Number.parseInt(project.id, 10) || project.id.length || 1;

  const contentPageCount = memberCount + 3 + (seed % 4);
  const contentRecentUpdates = 1 + (seed % 3);
  const contentReviewQueue = seed % 3;

  const integrationsConnected = 1 + (seed % 2);
  const integrationsAttentionNeeded = seed % 2;
  const integrationsPlanned = 2 + (seed % 2);

  return {
    issues: getProjectIssuesPreview(project, members),
    content: {
      pageCount: contentPageCount,
      recentUpdates: contentRecentUpdates,
      reviewQueue: contentReviewQueue,
      items: [
        {
          title: `${project.name} brief`,
          description: 'Shared framing for scope, goals, and ownership.',
          updatedLabel: 'Updated this week'
        },
        {
          title: `${project.name} decisions log`,
          description: 'Architecture and delivery decisions worth preserving.',
          updatedLabel: 'Needs review'
        },
        {
          title: `${project.name} rollout notes`,
          description: 'Operational steps, handoff notes, and launch guidance.',
          updatedLabel: 'Draft outline'
        }
      ]
    },
    integrations: {
      connected: integrationsConnected,
      attentionNeeded: integrationsAttentionNeeded,
      planned: integrationsPlanned,
      items: [
        {
          title: 'Project notifications',
          description: 'Delivery and workspace notifications routed into team channels.',
          status: ProjectIntegrationStatus.CONNECTED
        },
        {
          title: 'Automation hooks',
          description: 'Status changes and sync jobs for downstream workflows.',
          status:
            integrationsAttentionNeeded > 0
              ? ProjectIntegrationStatus.ACTION_NEEDED
              : ProjectIntegrationStatus.CONNECTED
        },
        {
          title: 'External knowledge sync',
          description: 'Publishing approved docs and workspace context into downstream tools.',
          status: ProjectIntegrationStatus.PLANNED
        }
      ]
    }
  };
}

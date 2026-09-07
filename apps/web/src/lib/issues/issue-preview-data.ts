import type { Project, ProjectMember } from '~/types/project.types';

export const enum ProjectIssueStatusTone {
  BACKLOG = 'backlog',
  ACTIVE = 'active',
  BLOCKED = 'blocked',
  DONE = 'done'
}

export const enum ProjectIssueStage {
  BACKLOG = 'backlog',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  DONE = 'done'
}

export interface ProjectIssueAssigneePreview {
  avatarUrl: string | null;
  initials: string;
  name: string;
  userId: number;
}

export interface ProjectIssueActivityPreview {
  id: string;
  summary: string;
  timeLabel: string;
}

export interface ProjectIssuePreview {
  assignees: ProjectIssueAssigneePreview[];
  attachmentsCount: number;
  commentsCount: number;
  description: string;
  descriptionMarkdown?: string;
  dueAt: string | Date | null;
  dueLabel: string;
  estimate: number | null;
  id: string;
  identifier: string;
  labels: string[];
  revision?: string;
  title: string;
  ownerLabel: string;
  priorityLabel: string;
  stage: ProjectIssueStage;
  statusLabel: string;
  subtaskCompletedCount: number;
  subtaskCount: number;
  tone: ProjectIssueStatusTone;
  updatedLabel: string;
  recentActivity: ProjectIssueActivityPreview[];
}

export interface ProjectIssuesPreview {
  open: number;
  inProgress: number;
  blocked: number;
  done: number;
  items: ProjectIssuePreview[];
}

function getSeed(projectId: string): number {
  const numericId = Number.parseInt(projectId, 10);
  return Number.isFinite(numericId) && numericId > 0 ? numericId : projectId.length || 1;
}

function getMemberLabel(project: Project, members: ProjectMember[], index: number): string {
  const member = members[index % Math.max(members.length, 1)];
  const normalizedName = member?.displayName?.trim();

  if (normalizedName && normalizedName.length > 0) {
    return normalizedName;
  }

  if (member?.userId) {
    return `User ${member.userId}`;
  }

  return project.name;
}

function getInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getAssigneePreview(
  project: Project,
  members: ProjectMember[],
  index: number
): ProjectIssueAssigneePreview {
  const member = members[index % Math.max(members.length, 1)];
  const name = getMemberLabel(project, members, index);

  return {
    avatarUrl: member?.photoUrl ?? null,
    initials: getInitials(name || project.name),
    name,
    userId: member?.userId ? Number(member.userId) : index + 1
  };
}

function getProjectKey(project: Project): string {
  return project.key || `P${project.id}`;
}

export function getProjectIssuesPreview(
  project: Project,
  members: ProjectMember[]
): ProjectIssuesPreview {
  const seed = getSeed(project.id);
  const projectKey = getProjectKey(project);
  const issueItems: ProjectIssuePreview[] = [
    {
      id: `${project.id}-issue-1`,
      identifier: `${projectKey}-${seed + 11}`,
      title: `Ship ${project.name} issue list redesign`,
      description:
        'Replace the placeholder project issues page with a compact list workspace that keeps triage and execution in the same screen.',
      ownerLabel: getMemberLabel(project, members, 0),
      assignees: [getAssigneePreview(project, members, 0)],
      statusLabel: 'In progress',
      stage: ProjectIssueStage.IN_PROGRESS,
      tone: ProjectIssueStatusTone.ACTIVE,
      priorityLabel: 'Urgent',
      labels: ['Design system', 'Frontend'],
      estimate: 5,
      dueAt: null,
      updatedLabel: 'Updated 12m ago',
      dueLabel: 'Due today',
      commentsCount: 4,
      attachmentsCount: 2,
      subtaskCount: 6,
      subtaskCompletedCount: 4,
      recentActivity: [
        {
          id: `${project.id}-issue-1-activity-1`,
          summary: 'Sidebar interactions scoped to issue selection state.',
          timeLabel: '8m ago'
        },
        {
          id: `${project.id}-issue-1-activity-2`,
          summary: 'Mock list density updated after design review.',
          timeLabel: '23m ago'
        }
      ]
    },
    {
      id: `${project.id}-issue-2`,
      identifier: `${projectKey}-${seed + 12}`,
      title: `Refine backlog defaults for ${project.name}`,
      description:
        'Define the default issue groupings, saved filters, and lightweight empty states so new projects have a usable queue from day one.',
      ownerLabel: getMemberLabel(project, members, 1),
      assignees: [getAssigneePreview(project, members, 1), getAssigneePreview(project, members, 2)],
      statusLabel: 'Backlog',
      stage: ProjectIssueStage.BACKLOG,
      tone: ProjectIssueStatusTone.BACKLOG,
      priorityLabel: 'High',
      labels: ['Planning', 'Workflow'],
      estimate: 3,
      dueAt: null,
      updatedLabel: 'Updated 1h ago',
      dueLabel: 'Due tomorrow',
      commentsCount: 2,
      attachmentsCount: 0,
      subtaskCount: 4,
      subtaskCompletedCount: 1,
      recentActivity: [
        {
          id: `${project.id}-issue-2-activity-1`,
          summary: 'Added draft defaults for Active, Backlog, and Mine filters.',
          timeLabel: '39m ago'
        },
        {
          id: `${project.id}-issue-2-activity-2`,
          summary: 'Waiting on product sign-off for backlog ordering.',
          timeLabel: '1h ago'
        }
      ]
    },
    {
      id: `${project.id}-issue-3`,
      identifier: `${projectKey}-${seed + 13}`,
      title: 'Resolve blocked dependency mapping',
      description:
        'Clarify the dependency graph shown in issue details so blockers, blocked work, and handoff notes read clearly without leaving the list.',
      ownerLabel: getMemberLabel(project, members, 2),
      assignees: [getAssigneePreview(project, members, 2)],
      statusLabel: 'Blocked',
      stage: ProjectIssueStage.BLOCKED,
      tone: ProjectIssueStatusTone.BLOCKED,
      priorityLabel: 'High',
      labels: ['Dependencies', 'UX'],
      estimate: 2,
      dueAt: null,
      updatedLabel: 'Updated 3h ago',
      dueLabel: 'Waiting on API contract',
      commentsCount: 6,
      attachmentsCount: 1,
      subtaskCount: 3,
      subtaskCompletedCount: 1,
      recentActivity: [
        {
          id: `${project.id}-issue-3-activity-1`,
          summary: 'API payload shape still missing issue relation metadata.',
          timeLabel: '2h ago'
        },
        {
          id: `${project.id}-issue-3-activity-2`,
          summary: 'Design notes added for blocked-state treatment in the sidebar.',
          timeLabel: '3h ago'
        }
      ]
    },
    {
      id: `${project.id}-issue-4`,
      identifier: `${projectKey}-${seed + 14}`,
      title: 'Audit row actions and keyboard affordances',
      description:
        'Bring the mock closer to Linear by supporting compact row actions, selection states, and keyboard-first scanning cues.',
      ownerLabel: getMemberLabel(project, members, 0),
      assignees: [getAssigneePreview(project, members, 0), getAssigneePreview(project, members, 1)],
      statusLabel: 'In progress',
      stage: ProjectIssueStage.IN_PROGRESS,
      tone: ProjectIssueStatusTone.ACTIVE,
      priorityLabel: 'Medium',
      labels: ['Accessibility', 'Interaction'],
      estimate: 3,
      dueAt: null,
      updatedLabel: 'Updated yesterday',
      dueLabel: 'Due this week',
      commentsCount: 1,
      attachmentsCount: 0,
      subtaskCount: 5,
      subtaskCompletedCount: 2,
      recentActivity: [
        {
          id: `${project.id}-issue-4-activity-1`,
          summary: 'Selection + hover states verified on list rows.',
          timeLabel: 'Yesterday'
        },
        {
          id: `${project.id}-issue-4-activity-2`,
          summary: 'Added keyboard hint copy for peek-like interactions.',
          timeLabel: 'Yesterday'
        }
      ]
    },
    {
      id: `${project.id}-issue-5`,
      identifier: `${projectKey}-${seed + 15}`,
      title: 'Document project issue mock data contract',
      description:
        'Define the richer issue preview shape used by mocks so the real backend integration can replace it without another UI rewrite.',
      ownerLabel: getMemberLabel(project, members, 1),
      assignees: [getAssigneePreview(project, members, 1)],
      statusLabel: 'Done',
      stage: ProjectIssueStage.DONE,
      tone: ProjectIssueStatusTone.DONE,
      priorityLabel: 'Low',
      labels: ['Docs'],
      estimate: 1,
      dueAt: null,
      updatedLabel: 'Updated 2d ago',
      dueLabel: 'Completed',
      commentsCount: 3,
      attachmentsCount: 1,
      subtaskCount: 2,
      subtaskCompletedCount: 2,
      recentActivity: [
        {
          id: `${project.id}-issue-5-activity-1`,
          summary: 'Mock schema recorded for frontend handoff.',
          timeLabel: '2d ago'
        },
        {
          id: `${project.id}-issue-5-activity-2`,
          summary: 'Implementation notes linked from the overview.',
          timeLabel: '2d ago'
        }
      ]
    },
    {
      id: `${project.id}-issue-6`,
      identifier: `${projectKey}-${seed + 16}`,
      title: 'Tighten filters for “Mine” and “Blocked”',
      description:
        'Add visible quick filters that help the page feel operational instead of presentational, even while still running on mock data.',
      ownerLabel: getMemberLabel(project, members, 2),
      assignees: [getAssigneePreview(project, members, 2), getAssigneePreview(project, members, 0)],
      statusLabel: 'Backlog',
      stage: ProjectIssueStage.BACKLOG,
      tone: ProjectIssueStatusTone.BACKLOG,
      priorityLabel: 'Medium',
      labels: ['Filters', 'Mock'],
      estimate: 2,
      dueAt: null,
      updatedLabel: 'Updated 4d ago',
      dueLabel: 'Planned next',
      commentsCount: 0,
      attachmentsCount: 0,
      subtaskCount: 3,
      subtaskCompletedCount: 0,
      recentActivity: [
        {
          id: `${project.id}-issue-6-activity-1`,
          summary: 'Filter chip copy aligned with issue status groups.',
          timeLabel: '4d ago'
        },
        {
          id: `${project.id}-issue-6-activity-2`,
          summary: 'Awaiting follow-up once real list counts are wired.',
          timeLabel: '5d ago'
        }
      ]
    }
  ];

  return {
    open: issueItems.filter((issue) => issue.stage !== ProjectIssueStage.DONE).length,
    inProgress: issueItems.filter((issue) => issue.stage === ProjectIssueStage.IN_PROGRESS).length,
    blocked: issueItems.filter((issue) => issue.stage === ProjectIssueStage.BLOCKED).length,
    done: issueItems.filter((issue) => issue.stage === ProjectIssueStage.DONE).length,
    items: issueItems
  };
}

export function getProjectIssuePreviewById(
  project: Project,
  members: ProjectMember[],
  issueId: string
): ProjectIssuePreview | null {
  return (
    getProjectIssuesPreview(project, members).items.find((issue) => issue.id === issueId) ?? null
  );
}

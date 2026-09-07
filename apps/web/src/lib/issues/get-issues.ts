import { headers } from 'next/headers';

import type {
  IssueActivity,
  IssueAttachment,
  IssueDetail,
  IssuePageData,
  IssueLabel,
  IssueListItem,
  MyWorkPageData,
  IssuesSummary,
  IssuesListResponse,
  WorkspaceIssuesPageData
} from '~/types/issue.types';
import type { Project, ProjectMember } from '~/types/project.types';

import { resolveServerRequestAuthContext } from '~/lib/auth/server-request-auth';
import {
  ensurePhase0Trace,
  getPhase0ApiTargetAttributes,
  getPhase0TraceAttributes,
  getPhase0TraceHeaderMap,
  measurePhase0,
  recordPhase0Note
} from '~/lib/diagnostics/phase-zero-diagnostics';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';
const DEFAULT_PAGE_SIZE = 100;
export const MY_WORK_ISSUES_PAGE_SIZE = 25;
export const WORKSPACE_ISSUES_PAGE_SIZE = 500;
export const RELATION_CANDIDATES_PAGE_SIZE = 100;

export class IssueFetchError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'IssueFetchError';
  }
}

function buildHeaders(
  accessToken?: string,
  tenantId?: string,
  traceHeaders?: Record<string, string>
): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(traceHeaders ?? {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(tenantId ? { 'x-tenant-id': tenantId } : {})
  };
}

function unwrapResponse<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

function normalizeIssuesListResponse(raw: unknown): IssuesListResponse {
  const normalized = (raw ?? {}) as {
    data?: unknown;
    metadata?: { pagination?: IssuesListResponse['metadata']['pagination'] };
  };
  const nestedData =
    !Array.isArray(normalized.data) && normalized.data && typeof normalized.data === 'object'
      ? (normalized.data as {
          data?: unknown;
          metadata?: { pagination?: IssuesListResponse['metadata']['pagination'] };
        })
      : null;
  const items = Array.isArray(normalized.data)
    ? normalized.data
    : Array.isArray(nestedData?.data)
      ? nestedData.data
      : [];
  const pagination = normalized.metadata?.pagination ??
    nestedData?.metadata?.pagination ?? {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      total: items.length,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    };

  return {
    data: items as IssueListItem[],
    metadata: {
      pagination
    }
  };
}

function normalizeWorkspaceProject(raw: unknown): Project {
  const project = (raw ?? {}) as Record<string, unknown>;

  return {
    id: String(project['id'] ?? ''),
    organizationId: String(project['organizationId'] ?? ''),
    createdBy: String(project['createdBy'] ?? ''),
    key: String(project['key'] ?? ''),
    name: String(project['name'] ?? ''),
    visibility:
      project['visibility'] === 'private' || project['visibility'] === 'public'
        ? project['visibility']
        : 'public',
    isMember: Boolean(project['isMember']),
    createdAt: '',
    updatedAt: ''
  };
}

function normalizeWorkspaceProjectMember(raw: unknown): ProjectMember {
  const member = (raw ?? {}) as Record<string, unknown>;

  return {
    userId: String(member['userId'] ?? ''),
    displayName: typeof member['displayName'] === 'string' ? member['displayName'] : null,
    photoUrl: typeof member['photoUrl'] === 'string' ? member['photoUrl'] : null,
    isCreator: Boolean(member['isCreator']),
    assignedAt: String(member['assignedAt'] ?? '')
  };
}

function normalizeWorkspaceIssuesPageData(raw: unknown): WorkspaceIssuesPageData {
  const payload = unwrapResponse<Partial<WorkspaceIssuesPageData>>(raw) as Record<string, unknown>;
  const privateProjectMembersByProjectId =
    payload['privateProjectMembersByProjectId'] &&
    typeof payload['privateProjectMembersByProjectId'] === 'object'
      ? Object.fromEntries(
          Object.entries(
            payload['privateProjectMembersByProjectId'] as Record<string, unknown>
          ).map(([projectId, members]) => [
            projectId,
            Array.isArray(members)
              ? members.map((member) => normalizeWorkspaceProjectMember(member))
              : []
          ])
        )
      : {};

  return {
    issues: normalizeIssuesListResponse(payload['issues']),
    labels: Array.isArray(payload['labels']) ? (payload['labels'] as IssueLabel[]) : [],
    projects: Array.isArray(payload['projects'])
      ? payload['projects'].map((project) => normalizeWorkspaceProject(project))
      : [],
    organizationMembers: Array.isArray(payload['organizationMembers'])
      ? payload['organizationMembers'].map((member) => normalizeWorkspaceProjectMember(member))
      : [],
    privateProjectMembersByProjectId
  };
}

function normalizeMyWorkPageData(raw: unknown): MyWorkPageData {
  const payload = unwrapResponse<Partial<MyWorkPageData>>(raw) as Record<string, unknown>;

  return {
    assignedIssues: Array.isArray(payload['assignedIssues'])
      ? (payload['assignedIssues'] as IssueListItem[])
      : [],
    assignedIssueCount:
      typeof payload['assignedIssueCount'] === 'number' ? payload['assignedIssueCount'] : 0,
    watchingIssues: Array.isArray(payload['watchingIssues'])
      ? (payload['watchingIssues'] as IssueListItem[])
      : [],
    recentIssues: Array.isArray(payload['recentIssues'])
      ? (payload['recentIssues'] as IssueListItem[])
      : [],
    accessibleProjectCount:
      typeof payload['accessibleProjectCount'] === 'number' ? payload['accessibleProjectCount'] : 0,
    ownedProjectCount:
      typeof payload['ownedProjectCount'] === 'number' ? payload['ownedProjectCount'] : 0,
    collaborationProjectCount:
      typeof payload['collaborationProjectCount'] === 'number'
        ? payload['collaborationProjectCount']
        : 0
  };
}

function normalizeIssuePageData(raw: unknown): IssuePageData {
  const payload = unwrapResponse<Partial<IssuePageData>>(raw) as Record<string, unknown>;

  return {
    issue: (payload['issue'] ?? {}) as IssueDetail,
    attachments: Array.isArray(payload['attachments'])
      ? (payload['attachments'] as IssueAttachment[])
      : [],
    labels: Array.isArray(payload['labels']) ? (payload['labels'] as IssueLabel[]) : [],
    members: Array.isArray(payload['members'])
      ? payload['members'].map((member) => normalizeWorkspaceProjectMember(member))
      : [],
    relationCandidates: Array.isArray(payload['relationCandidates'])
      ? (payload['relationCandidates'] as IssueListItem[])
      : []
  };
}

function buildIssueQuery(
  query: Partial<{
    page: number;
    pageSize: number;
    projectId: number;
    labelId: number;
    assigneeUserId: number;
    watcherUserId: number;
    activityActorUserId: number;
    search: string;
    status: string;
    priority: string;
    sortBy: string;
    sortOrder: string;
  }>
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).length > 0) {
      params.set(key, String(value));
    }
  }

  return params;
}

async function fetchIssuesJson(pathname: string, query?: URLSearchParams): Promise<unknown> {
  return fetchIssueResourceJson(pathname, {
    query,
    errorMessage: 'Failed to fetch issues'
  });
}

async function fetchIssueResourceJson(
  pathname: string,
  {
    query,
    errorMessage
  }: {
    query?: URLSearchParams;
    errorMessage: string;
  }
): Promise<unknown> {
  const requestHeaders = await headers();
  const auth = await resolveServerRequestAuthContext({
    source: 'web.issues.server_loader',
    route: pathname
  });
  const apiBaseUrl = getVersionedApiBaseUrl('v1');
  const search = query && query.toString().length > 0 ? `?${query.toString()}` : '';
  const url = `${apiBaseUrl}${pathname}${search}`;
  const apiTargetAttributes = getPhase0ApiTargetAttributes(apiBaseUrl);
  const phase0Trace = ensurePhase0Trace(requestHeaders);
  const phase0TraceAttributes = getPhase0TraceAttributes(phase0Trace);
  const phase0TraceHeaders = getPhase0TraceHeaderMap(phase0Trace);

  recordPhase0Note('web.issues.fetch.target', {
    pathname,
    hasQuery: Boolean(search),
    ...apiTargetAttributes,
    ...phase0TraceAttributes
  });

  const response = await measurePhase0(
    'web.issues.fetch',
    {
      pathname,
      hasQuery: Boolean(search),
      tenantIdPresent: Boolean(auth?.tenantId),
      ...phase0TraceAttributes,
      ...apiTargetAttributes
    },
    async () =>
      fetch(url, {
        method: 'GET',
        headers: buildHeaders(auth?.accessToken, auth?.tenantId, phase0TraceHeaders),
        cache: 'no-store'
      })
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new IssueFetchError(`${errorMessage}: ${response.status} ${errorText}`, response.status);
  }

  return response.json();
}

export async function listIssues(
  query: Partial<{
    page: number;
    pageSize: number;
    projectId: number;
    labelId: number;
    assigneeUserId: number;
    watcherUserId: number;
    activityActorUserId: number;
    search: string;
    status: string;
    priority: string;
    sortBy: string;
    sortOrder: string;
  }> = {}
): Promise<IssuesListResponse> {
  const json = await fetchIssuesJson('/tickets', buildIssueQuery(query));
  return normalizeIssuesListResponse(json);
}

export async function listAllIssues(
  query: Partial<{
    projectId: number;
    labelId: number;
    assigneeUserId: number;
    watcherUserId: number;
    activityActorUserId: number;
    search: string;
    status: string;
    priority: string;
    sortBy: string;
    sortOrder: string;
  }> = {}
): Promise<IssueListItem[]> {
  return measurePhase0(
    'web.issues.list_all',
    {
      hasProjectId: typeof query.projectId === 'number',
      hasAssigneeUserId: typeof query.assigneeUserId === 'number',
      hasWatcherUserId: typeof query.watcherUserId === 'number',
      hasActivityActorUserId: typeof query.activityActorUserId === 'number'
    },
    async () => {
      const issues: IssueListItem[] = [];
      let page = 1;
      let hasNext = true;

      while (hasNext) {
        const response = await listIssues({
          ...query,
          page,
          pageSize: DEFAULT_PAGE_SIZE
        });
        issues.push(...response.data);
        hasNext = response.metadata.pagination.hasNext;
        page += 1;
      }

      return issues;
    }
  );
}

export async function listBoundedIssues(
  query: Partial<{
    projectId: number;
    labelId: number;
    assigneeUserId: number;
    watcherUserId: number;
    activityActorUserId: number;
    search: string;
    status: string;
    priority: string;
    sortBy: string;
    sortOrder: string;
  }> = {},
  pageSize = WORKSPACE_ISSUES_PAGE_SIZE,
  fallbackToAllOnHasNext = false
): Promise<IssuesListResponse> {
  return measurePhase0(
    'web.issues.list_bounded',
    {
      pageSize,
      hasProjectId: typeof query.projectId === 'number',
      hasAssigneeUserId: typeof query.assigneeUserId === 'number',
      hasWatcherUserId: typeof query.watcherUserId === 'number',
      hasActivityActorUserId: typeof query.activityActorUserId === 'number'
    },
    async () => {
      const response = await listIssues({
        ...query,
        page: 1,
        pageSize
      });

      recordPhase0Note('web.issues.list_bounded.result', {
        pageSize,
        returned: response.data.length,
        hasNext: response.metadata.pagination.hasNext,
        fallbackToAllOnHasNext
      });

      if (fallbackToAllOnHasNext && response.metadata.pagination.hasNext) {
        recordPhase0Note('web.issues.list_bounded.truncated', {
          pageSize,
          returned: response.data.length,
          total: response.metadata.pagination.total
        });
      }

      return response;
    }
  );
}

export async function listRelationCandidateIssues(
  projectId: number,
  issueId: string
): Promise<IssueListItem[]> {
  return measurePhase0(
    'web.issues.list_relation_candidates',
    {
      projectId,
      issueIdPresent: issueId.length > 0,
      pageSize: RELATION_CANDIDATES_PAGE_SIZE
    },
    async () => {
      const json = await fetchIssueResourceJson(
        `/tickets/${encodeURIComponent(issueId)}/link-suggestions`,
        {
          errorMessage: 'Failed to fetch relation candidates'
        }
      );

      const candidates = unwrapResponse<IssueListItem[]>(json);
      return candidates.filter((candidate) => candidate.projectId === projectId);
    }
  );
}

export async function getWorkspaceIssuesPageData(): Promise<WorkspaceIssuesPageData> {
  const json = await fetchIssueResourceJson('/tickets/board', {
    errorMessage: 'Failed to fetch workspace issues page'
  });
  return normalizeWorkspaceIssuesPageData(json);
}

export async function getMyWorkPageData(): Promise<MyWorkPageData> {
  const json = await fetchIssueResourceJson('/tickets/mine', {
    errorMessage: 'Failed to fetch my work page'
  });
  return normalizeMyWorkPageData(json);
}

export async function getIssuePageData(issueId: string): Promise<IssuePageData> {
  const json = await fetchIssueResourceJson(`/tickets/${encodeURIComponent(issueId)}/page`, {
    errorMessage: 'Failed to fetch issue page'
  });
  return normalizeIssuePageData(json);
}

export async function getIssueById(issueId: string): Promise<IssueDetail> {
  const json = await fetchIssueResourceJson(`/tickets/${encodeURIComponent(issueId)}`, {
    errorMessage: 'Failed to fetch issue'
  });
  return unwrapResponse<IssueDetail>(json);
}

export async function listIssueActivity(issueId: string): Promise<IssueActivity[]> {
  const json = await fetchIssueResourceJson(`/tickets/${encodeURIComponent(issueId)}/activity`, {
    errorMessage: 'Failed to fetch issue activity'
  });
  return unwrapResponse<IssueActivity[]>(json);
}

export async function listIssueAttachments(issueId: string): Promise<IssueAttachment[]> {
  const json = await fetchIssueResourceJson(`/tickets/${encodeURIComponent(issueId)}/attachments`, {
    errorMessage: 'Failed to fetch issue attachments'
  });
  return unwrapResponse<IssueAttachment[]>(json);
}

export async function listIssueLabels(): Promise<IssueLabel[]> {
  const json = await fetchIssueResourceJson('/tickets/labels', {
    errorMessage: 'Failed to fetch issue labels'
  });
  return unwrapResponse<IssueLabel[]>(json);
}

export async function getIssuesSummary(
  query: Partial<{
    projectId: number;
    labelId: number;
    assigneeUserId: number;
    watcherUserId: number;
    search: string;
    status: string;
    priority: string;
  }> = {}
): Promise<IssuesSummary> {
  const json = await fetchIssuesJson('/tickets/summary', buildIssueQuery(query));
  return unwrapResponse<IssuesSummary>(json);
}

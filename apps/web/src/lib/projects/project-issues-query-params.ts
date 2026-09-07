export const enum ProjectIssuesFilter {
  ALL = 'all',
  ACTIVE = 'active',
  BACKLOG = 'backlog',
  BLOCKED = 'blocked',
  DONE = 'done',
  MINE = 'mine'
}

export const enum ProjectIssuesProjectScope {
  ALL = 'all',
  CONTEXT = 'context'
}

export interface ProjectIssuesQueryState {
  filter: ProjectIssuesFilter;
  issue: string | undefined;
  labelId: string | undefined;
  projectId: string | undefined;
  projectScope: ProjectIssuesProjectScope | undefined;
  search: string | undefined;
}

const DEFAULT_PROJECT_ISSUES_FILTER: ProjectIssuesFilter = ProjectIssuesFilter.ALL;
const VALID_FILTERS = new Set<ProjectIssuesFilter>([
  ProjectIssuesFilter.ALL,
  ProjectIssuesFilter.ACTIVE,
  ProjectIssuesFilter.BACKLOG,
  ProjectIssuesFilter.BLOCKED,
  ProjectIssuesFilter.DONE,
  ProjectIssuesFilter.MINE
]);

type RawSearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

function getParam(params: RawSearchParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) {
    return params.get(key) ?? undefined;
  }

  const value = params[key];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function parseProjectIssuesQueryParams(params: RawSearchParams): ProjectIssuesQueryState {
  const searchRaw = getParam(params, 'search')?.trim();
  const filterRaw = getParam(params, 'filter');
  const issueRaw = getParam(params, 'issue')?.trim();
  const labelIdRaw = getParam(params, 'labelId')?.trim();
  const projectIdRaw = getParam(params, 'projectId')?.trim();
  const projectScopeRaw = getParam(params, 'projectScope');

  const parsedProjectScope =
    projectScopeRaw === ProjectIssuesProjectScope.ALL ||
    projectScopeRaw === ProjectIssuesProjectScope.CONTEXT
      ? projectScopeRaw
      : undefined;
  const parsedProjectId = projectIdRaw && projectIdRaw.length > 0 ? projectIdRaw : undefined;

  return {
    filter:
      filterRaw && VALID_FILTERS.has(filterRaw as ProjectIssuesFilter)
        ? (filterRaw as ProjectIssuesFilter)
        : DEFAULT_PROJECT_ISSUES_FILTER,
    issue: issueRaw && issueRaw.length > 0 ? issueRaw : undefined,
    labelId: labelIdRaw && labelIdRaw.length > 0 ? labelIdRaw : undefined,
    projectId: parsedProjectScope === ProjectIssuesProjectScope.ALL ? undefined : parsedProjectId,
    projectScope: parsedProjectScope,
    search: searchRaw && searchRaw.length > 0 ? searchRaw : undefined
  };
}

export function getProjectIssuesSavedViewState(
  query: ProjectIssuesQueryState
): ProjectIssuesQueryState {
  return {
    ...query,
    issue: undefined
  };
}

export function getPostCreateProjectIssuesQueryState(
  _query: ProjectIssuesQueryState,
  createdProjectId?: string | null
): ProjectIssuesQueryState {
  if (createdProjectId && createdProjectId.length > 0) {
    return {
      filter: ProjectIssuesFilter.ALL,
      issue: undefined,
      labelId: undefined,
      projectId: createdProjectId,
      projectScope: undefined,
      search: undefined
    };
  }

  return {
    filter: ProjectIssuesFilter.ALL,
    issue: undefined,
    labelId: undefined,
    projectId: undefined,
    projectScope: ProjectIssuesProjectScope.ALL,
    search: undefined
  };
}

export function buildProjectIssuesDetailHrefs(
  query: ProjectIssuesQueryState,
  issueId: string,
  currentParams?: URLSearchParams
): { listHref: string; issueHref: string } {
  const nextParams = toProjectIssuesSearchParams(
    getProjectIssuesSavedViewState(query),
    currentParams
  );
  const next = nextParams.toString();

  return {
    listHref: next ? `/issues?${next}` : '/issues',
    issueHref: next ? `/issues/${encodeURIComponent(issueId)}?${next}` : `/issues/${issueId}`
  };
}

export function toProjectIssuesSearchParams(
  query: ProjectIssuesQueryState,
  currentParams?: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams(currentParams?.toString() ?? '');

  params.delete('filter');
  params.delete('issue');
  params.delete('labelId');
  params.delete('projectId');
  params.delete('projectScope');
  params.delete('search');

  if (query.filter !== DEFAULT_PROJECT_ISSUES_FILTER) {
    params.set('filter', query.filter);
  }

  if (query.issue) {
    params.set('issue', query.issue);
  }

  if (query.labelId) {
    params.set('labelId', query.labelId);
  }

  if (query.projectId && query.projectScope !== ProjectIssuesProjectScope.ALL) {
    params.set('projectId', query.projectId);
  }

  if (query.projectScope) {
    params.set('projectScope', query.projectScope);
  }

  if (query.search) {
    params.set('search', query.search);
  }

  return params;
}

export function getSynchronizedProjectIssuesQueryState(
  query: ProjectIssuesQueryState,
  activeProjectId: string | null
): ProjectIssuesQueryState | null {
  if (query.projectScope === ProjectIssuesProjectScope.ALL) {
    return null;
  }

  if (query.projectScope === ProjectIssuesProjectScope.CONTEXT) {
    const nextProjectId = activeProjectId ?? undefined;
    const nextProjectScope = activeProjectId
      ? ProjectIssuesProjectScope.CONTEXT
      : ProjectIssuesProjectScope.ALL;
    const didProjectChange = query.projectId !== nextProjectId;

    if (!didProjectChange && query.projectScope === nextProjectScope) {
      return null;
    }

    return {
      ...query,
      issue: didProjectChange ? undefined : query.issue,
      labelId: didProjectChange ? undefined : query.labelId,
      projectId: nextProjectId,
      projectScope: nextProjectScope
    };
  }

  return null;
}

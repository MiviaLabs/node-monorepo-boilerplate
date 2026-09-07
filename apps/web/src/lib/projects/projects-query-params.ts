import type {
  ProjectSortBy,
  ProjectSortOrder,
  ProjectsQueryInput,
  ProjectVisibility
} from '~/types/project.types';

import { PROJECT_SORT_BY, PROJECT_SORT_ORDER, PROJECT_VISIBILITY } from '~/types/project.types';

export const DEFAULT_PROJECTS_PAGE = 1;
export const DEFAULT_PROJECTS_PAGE_SIZE = 20;
export const DEFAULT_PROJECTS_SORT_BY = PROJECT_SORT_BY.UPDATED_AT;
export const DEFAULT_PROJECTS_SORT_ORDER = PROJECT_SORT_ORDER.DESC;
const MAX_PROJECTS_PAGE_SIZE = 100;

const VALID_VISIBILITY = new Set<ProjectVisibility>(Object.values(PROJECT_VISIBILITY));
const VALID_SORT_BY = new Set<ProjectSortBy>(Object.values(PROJECT_SORT_BY));
const VALID_SORT_ORDER = new Set<ProjectSortOrder>(Object.values(PROJECT_SORT_ORDER));

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

function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return typeof max === 'number' ? Math.min(value, max) : value;
}

export function parseProjectsQueryParams(
  params: RawSearchParams,
  defaults: { page?: number; pageSize?: number } = {}
): ProjectsQueryInput {
  const defaultPage = defaults.page ?? DEFAULT_PROJECTS_PAGE;
  const defaultPageSize = defaults.pageSize ?? DEFAULT_PROJECTS_PAGE_SIZE;

  const page = parsePositiveInt(getParam(params, 'page'), defaultPage);
  const pageSize = parsePositiveInt(
    getParam(params, 'pageSize'),
    defaultPageSize,
    MAX_PROJECTS_PAGE_SIZE
  );
  const searchRaw = getParam(params, 'search')?.trim();
  const visibilityRaw = getParam(params, 'visibility');
  const sortByRaw = getParam(params, 'sortBy');
  const sortOrderRaw = getParam(params, 'sortOrder');

  return {
    page,
    pageSize,
    search: searchRaw && searchRaw.length > 0 ? searchRaw : undefined,
    visibility:
      visibilityRaw && VALID_VISIBILITY.has(visibilityRaw as ProjectVisibility)
        ? (visibilityRaw as ProjectVisibility)
        : undefined,
    sortBy:
      sortByRaw && VALID_SORT_BY.has(sortByRaw as ProjectSortBy)
        ? (sortByRaw as ProjectSortBy)
        : DEFAULT_PROJECTS_SORT_BY,
    sortOrder:
      sortOrderRaw && VALID_SORT_ORDER.has(sortOrderRaw as ProjectSortOrder)
        ? (sortOrderRaw as ProjectSortOrder)
        : DEFAULT_PROJECTS_SORT_ORDER
  };
}

export function toProjectsQuerySearchParams(
  query: ProjectsQueryInput,
  defaults: { page?: number; pageSize?: number } = {}
): URLSearchParams {
  const defaultPage = defaults.page ?? DEFAULT_PROJECTS_PAGE;
  const defaultPageSize = defaults.pageSize ?? DEFAULT_PROJECTS_PAGE_SIZE;
  const params = new URLSearchParams();

  if (query.page !== defaultPage) {
    params.set('page', String(query.page));
  }

  if (query.pageSize !== defaultPageSize) {
    params.set('pageSize', String(query.pageSize));
  }

  if (query.search) params.set('search', query.search);
  if (query.visibility) params.set('visibility', query.visibility);
  if (query.sortBy && query.sortBy !== DEFAULT_PROJECTS_SORT_BY) params.set('sortBy', query.sortBy);
  if (query.sortOrder && query.sortOrder !== DEFAULT_PROJECTS_SORT_ORDER) {
    params.set('sortOrder', query.sortOrder);
  }

  return params;
}

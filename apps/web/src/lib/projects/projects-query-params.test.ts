import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROJECTS_SORT_BY,
  DEFAULT_PROJECTS_SORT_ORDER,
  parseProjectsQueryParams,
  toProjectsQuerySearchParams
} from './projects-query-params';

import { PROJECT_SORT_BY, PROJECT_SORT_ORDER, PROJECT_VISIBILITY } from '~/types/project.types';

describe('projects-query-params', () => {
  it('parses valid query params into normalized state', () => {
    const result = parseProjectsQueryParams(
      new URLSearchParams({
        page: '2',
        pageSize: '50',
        search: 'atlas',
        visibility: PROJECT_VISIBILITY.PRIVATE,
        sortBy: PROJECT_SORT_BY.NAME,
        sortOrder: PROJECT_SORT_ORDER.ASC
      })
    );

    expect(result).toEqual({
      page: 2,
      pageSize: 50,
      search: 'atlas',
      visibility: PROJECT_VISIBILITY.PRIVATE,
      sortBy: PROJECT_SORT_BY.NAME,
      sortOrder: PROJECT_SORT_ORDER.ASC
    });
  });

  it('falls back to defaults for invalid params', () => {
    const result = parseProjectsQueryParams(
      new URLSearchParams({
        page: '-1',
        pageSize: '999',
        visibility: 'secret',
        sortBy: 'owner',
        sortOrder: 'up'
      })
    );

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(100);
    expect(result.visibility).toBeUndefined();
    expect(result.sortBy).toBe(DEFAULT_PROJECTS_SORT_BY);
    expect(result.sortOrder).toBe(DEFAULT_PROJECTS_SORT_ORDER);
  });

  it('serializes non-default query params', () => {
    const params = toProjectsQuerySearchParams({
      page: 2,
      pageSize: 20,
      search: 'roadmap',
      visibility: PROJECT_VISIBILITY.PUBLIC,
      sortBy: PROJECT_SORT_BY.CREATED_AT,
      sortOrder: PROJECT_SORT_ORDER.ASC
    });

    expect(params.toString()).toBe(
      'page=2&search=roadmap&visibility=public&sortBy=createdAt&sortOrder=asc'
    );
  });
});

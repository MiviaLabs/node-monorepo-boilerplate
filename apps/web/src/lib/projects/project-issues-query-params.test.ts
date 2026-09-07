import { describe, expect, it } from 'vitest';

import {
  buildProjectIssuesDetailHrefs,
  getPostCreateProjectIssuesQueryState,
  getProjectIssuesSavedViewState,
  getSynchronizedProjectIssuesQueryState,
  parseProjectIssuesQueryParams,
  ProjectIssuesFilter,
  ProjectIssuesProjectScope,
  toProjectIssuesSearchParams
} from './project-issues-query-params';

describe('project issues query params', () => {
  it('parses optional projectId for workspace issues filtering', () => {
    expect(
      parseProjectIssuesQueryParams(
        new URLSearchParams(
          'filter=active&projectId=42&projectScope=context&issue=ISSUE-1&search=triage'
        )
      )
    ).toEqual({
      filter: ProjectIssuesFilter.ACTIVE,
      issue: 'ISSUE-1',
      labelId: undefined,
      projectId: '42',
      projectScope: ProjectIssuesProjectScope.CONTEXT,
      search: 'triage'
    });
  });

  it('treats explicit all-projects scope as stronger than a stale projectId', () => {
    expect(
      parseProjectIssuesQueryParams(new URLSearchParams('projectId=3&projectScope=all'))
    ).toEqual({
      filter: ProjectIssuesFilter.ALL,
      issue: undefined,
      labelId: undefined,
      projectId: undefined,
      projectScope: ProjectIssuesProjectScope.ALL,
      search: undefined
    });
  });

  it('serializes projectId into search params', () => {
    expect(
      toProjectIssuesSearchParams({
        filter: ProjectIssuesFilter.ALL,
        issue: undefined,
        labelId: undefined,
        projectId: '42',
        projectScope: ProjectIssuesProjectScope.CONTEXT,
        search: undefined
      }).toString()
    ).toBe('projectId=42&projectScope=context');
  });

  it('drops projectId when serializing explicit all-projects scope', () => {
    expect(
      toProjectIssuesSearchParams({
        filter: ProjectIssuesFilter.ALL,
        issue: undefined,
        labelId: undefined,
        projectId: '3',
        projectScope: ProjectIssuesProjectScope.ALL,
        search: undefined
      }).toString()
    ).toBe('projectScope=all');
  });

  it('keeps plain workspace issues state global even when a project context exists', () => {
    expect(
      getSynchronizedProjectIssuesQueryState(
        {
          filter: ProjectIssuesFilter.ALL,
          issue: undefined,
          labelId: undefined,
          projectId: undefined,
          projectScope: undefined,
          search: undefined
        },
        '42'
      )
    ).toBeNull();
  });

  it('keeps explicit all-projects mode independent from project context', () => {
    expect(
      getSynchronizedProjectIssuesQueryState(
        {
          filter: ProjectIssuesFilter.ALL,
          issue: undefined,
          labelId: undefined,
          projectId: undefined,
          projectScope: ProjectIssuesProjectScope.ALL,
          search: undefined
        },
        '42'
      )
    ).toBeNull();
  });

  it('updates context-following mode when the active project changes', () => {
    expect(
      getSynchronizedProjectIssuesQueryState(
        {
          filter: ProjectIssuesFilter.BLOCKED,
          issue: 'ISSUE-1',
          labelId: undefined,
          projectId: '42',
          projectScope: ProjectIssuesProjectScope.CONTEXT,
          search: 'triage'
        },
        '84'
      )
    ).toEqual({
      filter: ProjectIssuesFilter.BLOCKED,
      issue: undefined,
      labelId: undefined,
      projectId: '84',
      projectScope: ProjectIssuesProjectScope.CONTEXT,
      search: 'triage'
    });
  });

  it('drops transient issue selection from saved views', () => {
    expect(
      getProjectIssuesSavedViewState({
        filter: ProjectIssuesFilter.ACTIVE,
        issue: 'ISSUE-42',
        labelId: '9',
        projectId: '42',
        projectScope: ProjectIssuesProjectScope.CONTEXT,
        search: 'triage'
      })
    ).toEqual({
      filter: ProjectIssuesFilter.ACTIVE,
      issue: undefined,
      labelId: '9',
      projectId: '42',
      projectScope: ProjectIssuesProjectScope.CONTEXT,
      search: 'triage'
    });
  });

  it('preserves full query state when building issue detail hrefs', () => {
    expect(
      buildProjectIssuesDetailHrefs(
        {
          filter: ProjectIssuesFilter.BLOCKED,
          issue: undefined,
          labelId: '7',
          projectId: '3',
          projectScope: ProjectIssuesProjectScope.CONTEXT,
          search: 'api'
        },
        '55'
      )
    ).toEqual({
      listHref: '/issues?filter=blocked&labelId=7&projectId=3&projectScope=context&search=api',
      issueHref: '/issues/55?filter=blocked&labelId=7&projectId=3&projectScope=context&search=api'
    });
  });

  it('resets incompatible filters after creating a project-scoped issue', () => {
    expect(
      getPostCreateProjectIssuesQueryState(
        {
          filter: ProjectIssuesFilter.MINE,
          issue: undefined,
          labelId: '7',
          projectId: '3',
          projectScope: ProjectIssuesProjectScope.CONTEXT,
          search: 'triage'
        },
        '3'
      )
    ).toEqual({
      filter: ProjectIssuesFilter.ALL,
      issue: undefined,
      labelId: undefined,
      projectId: '3',
      projectScope: undefined,
      search: undefined
    });
  });

  it('resets incompatible filters after creating an organization issue', () => {
    expect(
      getPostCreateProjectIssuesQueryState(
        {
          filter: ProjectIssuesFilter.BLOCKED,
          issue: undefined,
          labelId: '7',
          projectId: '3',
          projectScope: ProjectIssuesProjectScope.CONTEXT,
          search: 'triage'
        },
        null
      )
    ).toEqual({
      filter: ProjectIssuesFilter.ALL,
      issue: undefined,
      labelId: undefined,
      projectId: undefined,
      projectScope: ProjectIssuesProjectScope.ALL,
      search: undefined
    });
  });
});

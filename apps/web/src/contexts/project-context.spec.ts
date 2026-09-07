import { describe, expect, it } from 'vitest';

import {
  getProjectContextRouteProjectId,
  normalizeProjectContextProjectId,
  resolveActiveProject,
  shouldClearInvalidProjectContext
} from './project-context';

import type { Project } from '~/types/project.types';

const projects: Project[] = [
  {
    id: '1',
    organizationId: '10',
    createdBy: '5',
    key: 'ATL',
    name: 'Atlas',
    visibility: 'private',
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z'
  },
  {
    id: '2',
    organizationId: '10',
    createdBy: '5',
    key: 'NST',
    name: 'Northstar',
    visibility: 'public',
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z'
  }
];

describe('project-context helpers', () => {
  it('normalizes project ids to positive integer strings', () => {
    expect(normalizeProjectContextProjectId(7)).toBe('7');
    expect(normalizeProjectContextProjectId('8')).toBe('8');
    expect(normalizeProjectContextProjectId('')).toBeNull();
    expect(normalizeProjectContextProjectId('abc')).toBeNull();
    expect(normalizeProjectContextProjectId(0)).toBeNull();
    expect(normalizeProjectContextProjectId(null)).toBeNull();
  });

  it('resolves the active project from the project list', () => {
    expect(resolveActiveProject(projects, '2')).toEqual(projects[1]);
    expect(resolveActiveProject(projects, '999')).toBeNull();
    expect(resolveActiveProject(projects, null)).toBeNull();
  });

  it('extracts project ids from project routes only', () => {
    expect(getProjectContextRouteProjectId('/projects/42')).toBe('42');
    expect(getProjectContextRouteProjectId('/projects/42/issues')).toBe('42');
    expect(getProjectContextRouteProjectId('/dashboard')).toBeNull();
    expect(getProjectContextRouteProjectId('/projects')).toBeNull();
    expect(getProjectContextRouteProjectId(null)).toBeNull();
  });

  it('clears invalid persisted project context only after projects finish loading', () => {
    expect(
      shouldClearInvalidProjectContext({
        activeProjectId: '999',
        isProjectsLoading: true,
        projects
      })
    ).toBe(false);

    expect(
      shouldClearInvalidProjectContext({
        activeProjectId: '999',
        isProjectsLoading: false,
        projects
      })
    ).toBe(true);

    expect(
      shouldClearInvalidProjectContext({
        activeProjectId: '2',
        isProjectsLoading: false,
        projects
      })
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  resolveCurrentContextLabel,
  resolveEffectiveContentProjectId,
  resolveProjectNavigationProjectId,
  resolveProjectSectionTitle
} from './project-navigation-state';
import { getDashboardShellContext } from './shell-routes';

describe('project-navigation-state', () => {
  it('does not create sidebar project navigation from route-only project pages', () => {
    expect(
      resolveProjectNavigationProjectId({
        persistedProjectId: null,
        isSwitchingOrganization: false
      })
    ).toBeNull();

    expect(
      resolveCurrentContextLabel({
        isSwitchingOrganization: false,
        activeProjectName: null
      })
    ).toBe('Organization overview');
  });

  it('uses persisted project context for sidebar project sections without leaking content scope', () => {
    expect(
      resolveProjectNavigationProjectId({
        persistedProjectId: '7',
        isSwitchingOrganization: false
      })
    ).toBe('7');

    expect(
      resolveProjectSectionTitle({
        isSwitchingOrganization: false,
        activeProjectName: 'Northstar'
      })
    ).toBe('Northstar');

    expect(
      resolveEffectiveContentProjectId({
        routeProjectId: null,
        isSwitchingOrganization: false
      })
    ).toBeNull();
  });

  it('clears project navigation while switching organizations', () => {
    expect(
      resolveProjectNavigationProjectId({
        persistedProjectId: '7',
        isSwitchingOrganization: true
      })
    ).toBeNull();

    expect(
      resolveProjectSectionTitle({
        isSwitchingOrganization: true,
        activeProjectName: 'Northstar'
      })
    ).toBe('Project');

    expect(
      resolveEffectiveContentProjectId({
        routeProjectId: '7',
        isSwitchingOrganization: true
      })
    ).toBeNull();
  });

  it('keeps content subpages inside the content project shell section', () => {
    expect(getDashboardShellContext('/projects/7/content/workspace-brief')).toMatchObject({
      projectId: '7',
      projectSection: 'content',
      scopeKind: 'project'
    });
  });

  it('prefers the route project id over persisted project context for content scope', () => {
    expect(
      resolveEffectiveContentProjectId({
        routeProjectId: '12',
        isSwitchingOrganization: false
      })
    ).toBe('12');
  });
});

import { describe, expect, it } from 'vitest';

import { DashboardRoute, getDashboardShellContext } from './shell-routes';

describe('getDashboardShellContext', () => {
  it('returns dashboard context for /dashboard', () => {
    expect(getDashboardShellContext('/dashboard')).toEqual({
      activeHref: DashboardRoute.Dashboard,
      breadcrumbs: ['Organization Overview'],
      pageTitle: 'Organization Overview',
      scopeKind: 'organization'
    });
  });

  it('returns my-work context for /my routes', () => {
    expect(getDashboardShellContext('/my')).toEqual({
      activeHref: DashboardRoute.MyWork,
      breadcrumbs: ['My Work'],
      pageTitle: 'My Work',
      scopeKind: 'my-work'
    });
    expect(getDashboardShellContext('/my/assigned')).toEqual({
      activeHref: DashboardRoute.MyWork,
      breadcrumbs: ['My Work'],
      pageTitle: 'My Work',
      scopeKind: 'my-work'
    });
  });

  it('returns members context for members routes', () => {
    expect(getDashboardShellContext('/members')).toEqual({
      activeHref: DashboardRoute.Members,
      breadcrumbs: ['Members'],
      pageTitle: 'Members',
      scopeKind: 'organization'
    });
    expect(getDashboardShellContext('/members/invite')).toEqual({
      activeHref: DashboardRoute.Members,
      breadcrumbs: ['Members'],
      pageTitle: 'Members',
      scopeKind: 'organization'
    });
  });

  it('returns content context for organization content routes', () => {
    expect(getDashboardShellContext('/content')).toEqual({
      activeHref: DashboardRoute.Content,
      breadcrumbs: ['Content'],
      pageTitle: 'Content',
      scopeKind: 'organization'
    });
    expect(getDashboardShellContext('/content/hello')).toEqual({
      activeHref: DashboardRoute.Content,
      breadcrumbs: ['Content'],
      pageTitle: 'Content',
      scopeKind: 'organization'
    });
  });

  it('returns issues context for top-level issues routes', () => {
    expect(getDashboardShellContext('/issues')).toEqual({
      activeHref: DashboardRoute.Issues,
      breadcrumbs: ['Issues'],
      pageTitle: 'Issues',
      scopeKind: 'organization'
    });
  });

  it('returns projects context for project routes', () => {
    expect(getDashboardShellContext('/projects')).toEqual({
      activeHref: DashboardRoute.Projects,
      breadcrumbs: ['Projects'],
      pageTitle: 'Projects',
      scopeKind: 'organization'
    });
    expect(getDashboardShellContext('/projects/12')).toEqual({
      activeHref: DashboardRoute.Projects,
      breadcrumbs: ['Projects', 'Project Details'],
      pageTitle: 'Project Details',
      projectId: '12',
      projectSection: 'settings',
      scopeKind: 'project'
    });
    expect(getDashboardShellContext('/projects/12/issues')).toEqual({
      activeHref: DashboardRoute.Projects,
      breadcrumbs: ['Projects', 'Issues'],
      pageTitle: 'Issues',
      projectId: '12',
      projectSection: 'issues',
      scopeKind: 'project'
    });
    expect(getDashboardShellContext('/projects/12/settings')).toEqual({
      activeHref: DashboardRoute.Projects,
      breadcrumbs: ['Projects', 'Project Details'],
      pageTitle: 'Project Details',
      projectId: '12',
      projectSection: 'settings',
      scopeKind: 'project'
    });
    expect(getDashboardShellContext('/projects/12/members')).toEqual({
      activeHref: DashboardRoute.Projects,
      breadcrumbs: ['Projects', 'Members'],
      pageTitle: 'Members',
      projectId: '12',
      projectSection: 'members',
      scopeKind: 'project'
    });
  });

  it('returns profile context for profile routes', () => {
    expect(getDashboardShellContext('/profile')).toEqual({
      activeHref: DashboardRoute.Profile,
      breadcrumbs: ['Profile'],
      pageTitle: 'Profile',
      scopeKind: 'my-work'
    });
    expect(getDashboardShellContext('/profile/security')).toEqual({
      activeHref: DashboardRoute.Profile,
      breadcrumbs: ['Profile'],
      pageTitle: 'Profile',
      scopeKind: 'my-work'
    });
  });

  it('returns account settings context for nested account settings routes', () => {
    expect(getDashboardShellContext('/account/settings')).toEqual({
      activeHref: DashboardRoute.AccountSettings,
      breadcrumbs: ['Account', 'Settings'],
      pageTitle: 'Account Settings',
      scopeKind: 'my-work'
    });
    expect(getDashboardShellContext('/account/settings/preferences')).toEqual({
      activeHref: DashboardRoute.AccountSettings,
      breadcrumbs: ['Account', 'Settings'],
      pageTitle: 'Account Settings',
      scopeKind: 'my-work'
    });
  });

  it('returns organization settings context for dashboard settings routes', () => {
    expect(getDashboardShellContext('/settings')).toEqual({
      activeHref: DashboardRoute.OrganizationSettings,
      breadcrumbs: ['Organization', 'Settings'],
      pageTitle: 'Organization Settings',
      scopeKind: 'organization'
    });
    expect(getDashboardShellContext('/settings/general')).toEqual({
      activeHref: DashboardRoute.OrganizationSettings,
      breadcrumbs: ['Organization', 'Settings'],
      pageTitle: 'Organization Settings',
      scopeKind: 'organization'
    });
  });

  it('falls back to dashboard context for unknown routes', () => {
    expect(getDashboardShellContext('/dashboard/unknown')).toEqual({
      activeHref: DashboardRoute.Dashboard,
      breadcrumbs: ['Organization Overview'],
      pageTitle: 'Organization Overview',
      scopeKind: 'organization'
    });
    expect(getDashboardShellContext('/anywhere-else')).toEqual({
      activeHref: DashboardRoute.Dashboard,
      breadcrumbs: ['Organization Overview'],
      pageTitle: 'Organization Overview',
      scopeKind: 'organization'
    });
  });
});

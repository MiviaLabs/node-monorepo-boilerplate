export enum DashboardRoute {
  Dashboard = '/dashboard',
  MyWork = '/my',
  Issues = '/issues',
  Content = '/content',
  Members = '/members',
  Projects = '/projects',
  OrganizationSettings = '/settings',
  Profile = '/profile',
  AccountSettings = '/account/settings'
}

export const PROJECT_SHELL_SECTIONS = [
  'issues',
  'content',
  'integrations',
  'members',
  'settings'
] as const;

export type ProjectShellSection = (typeof PROJECT_SHELL_SECTIONS)[number];

export const enum DashboardShellScope {
  ORGANIZATION = 'organization',
  MY_WORK = 'my-work',
  PROJECT = 'project'
}

export interface DashboardShellContext {
  activeHref: DashboardRoute;
  breadcrumbs: string[];
  pageTitle: string;
  scopeKind: DashboardShellScope;
  projectId?: string;
  projectSection?: ProjectShellSection;
}

const PROJECT_SECTION_LABELS: Record<ProjectShellSection, string> = {
  issues: 'Issues',
  content: 'Content',
  integrations: 'Integrations',
  members: 'Members',
  settings: 'Project Details'
};

function parseProjectShellContext(pathname: string): DashboardShellContext | null {
  const normalizedPath = pathname.split('?')[0] ?? pathname;
  const match = normalizedPath.match(/^\/projects\/([^/]+)(?:\/([^/]+))?(?:\/.*)?$/);

  if (!match) {
    return null;
  }

  const [, projectId, rawSection] = match;
  const projectSection = rawSection as ProjectShellSection | undefined;
  const hasValidSection = projectSection && PROJECT_SHELL_SECTIONS.includes(projectSection);

  return {
    activeHref: DashboardRoute.Projects,
    breadcrumbs: [
      'Projects',
      hasValidSection ? PROJECT_SECTION_LABELS[projectSection] : 'Project Details'
    ],
    pageTitle: hasValidSection ? PROJECT_SECTION_LABELS[projectSection] : 'Project Details',
    scopeKind: DashboardShellScope.PROJECT,
    projectId,
    projectSection: hasValidSection ? projectSection : 'settings'
  };
}

function matchesRoutePrefix(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * Maps the current pathname to dashboard shell navigation context.
 * @param pathname - Current route pathname.
 * @returns Active dashboard route and page title for shell rendering.
 */
export function getDashboardShellContext(pathname: string): DashboardShellContext {
  const normalizedPath = pathname.split('?')[0] ?? pathname;
  const projectContext = parseProjectShellContext(normalizedPath);

  if (projectContext) {
    return projectContext;
  }

  if (matchesRoutePrefix(normalizedPath, DashboardRoute.MyWork)) {
    return {
      activeHref: DashboardRoute.MyWork,
      breadcrumbs: ['My Work'],
      pageTitle: 'My Work',
      scopeKind: DashboardShellScope.MY_WORK
    };
  }

  if (
    matchesRoutePrefix(normalizedPath, DashboardRoute.AccountSettings) ||
    normalizedPath.startsWith('/dashboard/account/settings')
  ) {
    return {
      activeHref: DashboardRoute.AccountSettings,
      breadcrumbs: ['Account', 'Settings'],
      pageTitle: 'Account Settings',
      scopeKind: DashboardShellScope.MY_WORK
    };
  }

  if (
    matchesRoutePrefix(normalizedPath, DashboardRoute.Issues) ||
    normalizedPath.startsWith('/dashboard/issues')
  ) {
    return {
      activeHref: DashboardRoute.Issues,
      breadcrumbs: ['Issues'],
      pageTitle: 'Issues',
      scopeKind: DashboardShellScope.ORGANIZATION
    };
  }

  if (
    matchesRoutePrefix(normalizedPath, DashboardRoute.Content) ||
    normalizedPath.startsWith('/dashboard/content')
  ) {
    return {
      activeHref: DashboardRoute.Content,
      breadcrumbs: ['Content'],
      pageTitle: 'Content',
      scopeKind: DashboardShellScope.ORGANIZATION
    };
  }

  if (
    matchesRoutePrefix(normalizedPath, DashboardRoute.OrganizationSettings) ||
    normalizedPath.startsWith('/dashboard/settings')
  ) {
    return {
      activeHref: DashboardRoute.OrganizationSettings,
      breadcrumbs: ['Organization', 'Settings'],
      pageTitle: 'Organization Settings',
      scopeKind: DashboardShellScope.ORGANIZATION
    };
  }

  if (
    matchesRoutePrefix(normalizedPath, DashboardRoute.Members) ||
    normalizedPath.startsWith('/dashboard/members')
  ) {
    return {
      activeHref: DashboardRoute.Members,
      breadcrumbs: ['Members'],
      pageTitle: 'Members',
      scopeKind: DashboardShellScope.ORGANIZATION
    };
  }

  if (
    matchesRoutePrefix(normalizedPath, DashboardRoute.Projects) ||
    normalizedPath.startsWith('/dashboard/projects')
  ) {
    return {
      activeHref: DashboardRoute.Projects,
      breadcrumbs: ['Projects'],
      pageTitle: 'Projects',
      scopeKind: DashboardShellScope.ORGANIZATION
    };
  }

  if (
    matchesRoutePrefix(normalizedPath, DashboardRoute.Profile) ||
    normalizedPath.startsWith('/dashboard/profile')
  ) {
    return {
      activeHref: DashboardRoute.Profile,
      breadcrumbs: ['Profile'],
      pageTitle: 'Profile',
      scopeKind: DashboardShellScope.MY_WORK
    };
  }

  return {
    activeHref: DashboardRoute.Dashboard,
    breadcrumbs: ['Organization Overview'],
    pageTitle: 'Organization Overview',
    scopeKind: DashboardShellScope.ORGANIZATION
  };
}

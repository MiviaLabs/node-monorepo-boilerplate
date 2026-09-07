import {
  BookOpenText,
  Bug,
  FolderKanban,
  Inbox,
  LayoutGrid,
  type LucideIcon,
  Settings,
  Users
} from 'lucide-react';

import { DashboardRoute } from '~/components/dashboard/shell-routes';

export const enum SidebarItemMatchMode {
  EXACT = 'exact',
  PREFIX = 'prefix'
}

export interface FlexySidebarItem {
  href: string;
  label: string;
  icon: LucideIcon;
  matchMode?: SidebarItemMatchMode;
}

/**
 * Builds the base sidebar items visible to all authenticated users.
 * @returns Static primary navigation items for the sidebar.
 */
export function getMainSidebarItems(): FlexySidebarItem[] {
  return [
    {
      href: DashboardRoute.Dashboard,
      label: 'Overview',
      icon: LayoutGrid,
      matchMode: SidebarItemMatchMode.PREFIX
    },
    {
      href: DashboardRoute.MyWork,
      label: 'My Work',
      icon: Inbox,
      matchMode: SidebarItemMatchMode.PREFIX
    },
    {
      href: DashboardRoute.Issues,
      label: 'Issues',
      icon: Bug,
      matchMode: SidebarItemMatchMode.PREFIX
    }
  ];
}

/**
 * Builds organization-scoped sidebar items based on permissions.
 * @param params Permission flags controlling organization navigation visibility.
 * @returns Organization navigation items allowed for the current user.
 */
export function getOrganizationSidebarItems(params: {
  canViewMembers: boolean;
  canManageOrganization: boolean;
  canViewProjects: boolean;
}): FlexySidebarItem[] {
  const items: FlexySidebarItem[] = [];

  if (params.canViewProjects) {
    items.push({
      href: DashboardRoute.Projects,
      label: 'Projects',
      icon: FolderKanban,
      matchMode: SidebarItemMatchMode.EXACT
    });
  }

  if (params.canViewMembers) {
    items.push({
      href: DashboardRoute.Members,
      label: 'Members',
      icon: Users,
      matchMode: SidebarItemMatchMode.PREFIX
    });
  }

  if (params.canManageOrganization) {
    items.push({
      href: DashboardRoute.OrganizationSettings,
      label: 'Settings',
      icon: Settings,
      matchMode: SidebarItemMatchMode.PREFIX
    });
  }

  return items;
}

export function getContentSidebarItems(): FlexySidebarItem[] {
  return [
    {
      href: DashboardRoute.Content,
      label: 'Content',
      icon: BookOpenText,
      matchMode: SidebarItemMatchMode.PREFIX
    }
  ];
}

const PROJECT_SECTION_META: Record<
  'issues',
  { href: (projectId: string) => string; icon: LucideIcon; label: string }
> = {
  issues: {
    href: (projectId) => `${DashboardRoute.Issues}?projectId=${projectId}`,
    icon: Bug,
    label: 'Issues'
  }
};

export function getProjectSidebarItems(projectId: string): FlexySidebarItem[] {
  return (Object.keys(PROJECT_SECTION_META) as Array<keyof typeof PROJECT_SECTION_META>).map(
    (sectionKey) => {
      const meta = PROJECT_SECTION_META[sectionKey];

      return {
        href: meta.href(projectId),
        label: meta.label,
        icon: meta.icon,
        matchMode: SidebarItemMatchMode.PREFIX
      };
    }
  );
}

/**
 * Builds compact mobile navigation entries based on permissions.
 * @param params Permission flags controlling organization navigation visibility.
 * @returns Ordered mobile navigation links available to the current user.
 */
export function getMobileSidebarItems(params: {
  canViewMembers: boolean;
  canManageOrganization: boolean;
  canViewProjects: boolean;
}): Array<{ href: DashboardRoute; label: string }> {
  return [
    { href: DashboardRoute.Dashboard, label: 'Dashboard' },
    { href: DashboardRoute.Content, label: 'Content' },
    ...(params.canViewProjects ? [{ href: DashboardRoute.Projects, label: 'Projects' }] : []),
    ...(params.canViewMembers ? [{ href: DashboardRoute.Members, label: 'Members' }] : []),
    ...(params.canManageOrganization
      ? [{ href: DashboardRoute.OrganizationSettings, label: 'Settings' }]
      : [])
  ];
}

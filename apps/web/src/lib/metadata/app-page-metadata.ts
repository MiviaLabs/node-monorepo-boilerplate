import type { Metadata } from 'next';

export const enum AuthenticatedPageKey {
  DASHBOARD = 'dashboard',
  MY_WORK = 'myWork',
  CONTENT = 'content',
  MEMBERS = 'members',
  PROJECTS = 'projects',
  PROFILE = 'profile',
  ORGANIZATION_SETTINGS = 'organizationSettings',
  ACCOUNT_SETTINGS = 'accountSettings'
}

const AUTHENTICATED_PAGE_METADATA: Record<
  AuthenticatedPageKey,
  { title: string; description: string }
> = {
  [AuthenticatedPageKey.DASHBOARD]: {
    title: 'Dashboard',
    description: 'View your workspace dashboard and jump into the areas you use most.'
  },
  [AuthenticatedPageKey.MY_WORK]: {
    title: 'My Work',
    description: 'Review your cross-project work, tasks, and personal workspace activity.'
  },
  [AuthenticatedPageKey.CONTENT]: {
    title: 'Content',
    description: 'Write and organize shared workspace content for your organization.'
  },
  [AuthenticatedPageKey.MEMBERS]: {
    title: 'Members',
    description: 'Review workspace members, invitations, access, and directory activity.'
  },
  [AuthenticatedPageKey.PROJECTS]: {
    title: 'Projects',
    description: 'Browse workspace projects, visibility, and project creation actions.'
  },
  [AuthenticatedPageKey.PROFILE]: {
    title: 'Profile',
    description: 'Manage your profile, password, saved addresses, and session details.'
  },
  [AuthenticatedPageKey.ORGANIZATION_SETTINGS]: {
    title: 'Organization Settings',
    description: 'Manage your workspace display name and core organization configuration.'
  },
  [AuthenticatedPageKey.ACCOUNT_SETTINGS]: {
    title: 'Account Settings',
    description: 'Manage your account preferences, landing page, exports, and sensitive actions.'
  }
};

export function getAuthenticatedPageMetadata(page: AuthenticatedPageKey): Metadata {
  return AUTHENTICATED_PAGE_METADATA[page];
}

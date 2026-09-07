import { DashboardAppShellClient } from './app-shell-client';

import type { SidebarSectionKey } from '~/lib/user-settings/sidebar-section-order';
import type { UserOrganization } from '~/types/auth.types';

export { DashboardRoute, getDashboardShellContext } from './shell-routes';

export function DashboardAppShell({
  children,
  userDisplayName,
  userEmail,
  userRoles,
  userPermissions,
  organizations,
  currentOrganizationId,
  initialSectionOrder,
  initialWorkspaceActiveProjectId,
  pathname
}: {
  children: React.ReactNode;
  userDisplayName: string;
  userEmail: string;
  userRoles?: string[];
  userPermissions?: string[];
  organizations: UserOrganization[];
  currentOrganizationId: string | null;
  initialSectionOrder: SidebarSectionKey[];
  initialWorkspaceActiveProjectId: number | null;
  pathname?: string;
}) {
  return (
    <DashboardAppShellClient
      userDisplayName={userDisplayName}
      userEmail={userEmail}
      userRoles={userRoles}
      userPermissions={userPermissions}
      organizations={organizations}
      currentOrganizationId={currentOrganizationId}
      initialSectionOrder={initialSectionOrder}
      initialWorkspaceActiveProjectId={initialWorkspaceActiveProjectId}
      initialPathname={pathname}
    >
      {children}
    </DashboardAppShellClient>
  );
}

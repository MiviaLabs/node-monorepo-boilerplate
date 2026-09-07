/**
 * Protected App Layout
 *
 * Layout for authenticated routes
 */

import { DashboardAppShell } from '~/components/dashboard/app-shell';
import { getUserSession } from '~/lib/auth/get-user-session';

/**
 * Protected Layout Component
 *
 * Route-group wrapper for authenticated pages.
 * Middleware is the primary auth gate for this segment.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, organizations, currentOrganizationId, currentUserSettings } =
    await getUserSession();

  return (
    <DashboardAppShell
      userDisplayName={user.displayName ?? ''}
      userEmail={user.email}
      userRoles={user.roles}
      userPermissions={user.permissions}
      organizations={organizations}
      currentOrganizationId={currentOrganizationId}
      initialSectionOrder={currentUserSettings.sidebarSectionOrder}
      initialWorkspaceActiveProjectId={currentUserSettings.workspaceActiveProjectId}
    >
      {children}
    </DashboardAppShell>
  );
}

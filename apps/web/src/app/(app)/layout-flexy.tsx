import { DashboardAppShell } from '~/components/dashboard/app-shell';
import { getUserSession } from '~/lib/auth/get-user-session';

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

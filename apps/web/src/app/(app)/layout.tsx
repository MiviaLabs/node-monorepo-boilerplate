import type { Metadata } from 'next';

import { DashboardAppShell } from '~/components/dashboard/app-shell';
import { getUserSession } from '~/lib/auth/get-user-session';

export const metadata: Metadata = {
  title: {
    default: 'Workspace',
    template: '%s | Workspace'
  },
  description: 'Authenticated workspace area for your account and organization.'
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
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

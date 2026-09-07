import { redirect } from 'next/navigation';

import { OrganizationSettingsForm } from '../dashboard/settings/organization-settings-form';

import { getUserSession } from '~/lib/auth/get-user-session';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';
import { TENANT_ROLES } from '~/types/tenant.types';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.ORGANIZATION_SETTINGS);

export default async function SettingsPage() {
  const { user, tenantId, tenantName, tenantDisplayName, tenantSlug } = await getUserSession();
  const canManageOrganization =
    user.roles.includes(TENANT_ROLES.OWNER) || user.roles.includes(TENANT_ROLES.ADMIN);
  if (!canManageOrganization) {
    redirect('/dashboard');
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <OrganizationSettingsForm
        tenantId={tenantId}
        tenantSlug={tenantSlug ?? ''}
        tenantName={tenantName ?? ''}
        initialDisplayName={tenantDisplayName ?? ''}
      />
    </div>
  );
}

import { redirect } from 'next/navigation';

import { OrganizationContentPageContent } from '~/components/content/organization-content-page-content';
import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { getUserSession } from '~/lib/auth/get-user-session';
import { getFirstOrganizationContentSidebarEntry } from '~/lib/content/get-content';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.CONTENT);

export default async function OrganizationContentPage() {
  const { user } = await getUserSession();
  const firstPage = await getFirstOrganizationContentSidebarEntry();
  const access = getDashboardRouteAccess({
    roles: user.roles,
    permissions: user.permissions
  });

  if (firstPage) {
    redirect(`/content/${firstPage.slug}`);
  }

  return (
    <OrganizationContentPageContent
      canEdit={access.canUpdateContent}
      canDelete={access.canDeleteContent}
      pages={[]}
    />
  );
}

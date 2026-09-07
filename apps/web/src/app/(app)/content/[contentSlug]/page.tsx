import { notFound } from 'next/navigation';

import { OrganizationContentPageContent } from '~/components/content/organization-content-page-content';
import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { getUserSession } from '~/lib/auth/get-user-session';
import { ContentFetchError, getOrganizationContentPageBySlug } from '~/lib/content/get-content';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.CONTENT);

export default async function OrganizationContentSlugPage({
  params
}: {
  params: Promise<{ contentSlug: string }>;
}) {
  const { contentSlug } = await params;
  const { user } = await getUserSession();
  const access = getDashboardRouteAccess({
    roles: user.roles,
    permissions: user.permissions
  });
  let pages;

  try {
    pages = await getOrganizationContentPageBySlug(contentSlug);
  } catch (error) {
    if (error instanceof ContentFetchError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  return (
    <OrganizationContentPageContent
      canEdit={access.canUpdateContent}
      canDelete={access.canDeleteContent}
      pages={pages}
      selectedPageSlug={contentSlug}
    />
  );
}

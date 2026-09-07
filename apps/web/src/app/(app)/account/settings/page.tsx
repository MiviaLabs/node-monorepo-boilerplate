import { SettingsPageClient } from '../../dashboard/settings/settings-page-client';

import { getUserSession } from '~/lib/auth/get-user-session';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.ACCOUNT_SETTINGS);

export default async function AccountSettingsPage() {
  const { currentUserSettings } = await getUserSession();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <SettingsPageClient initialSettings={currentUserSettings} />
    </div>
  );
}

import { redirect } from 'next/navigation';

import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.ORGANIZATION_SETTINGS);

export default function LegacySettingsPage() {
  redirect('/settings');
}

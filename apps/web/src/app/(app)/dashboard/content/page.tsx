import { redirect } from 'next/navigation';

import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.CONTENT);

export default function LegacyContentPage() {
  redirect('/content');
}

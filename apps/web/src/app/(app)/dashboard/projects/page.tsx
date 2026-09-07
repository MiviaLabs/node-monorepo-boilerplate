import { redirect } from 'next/navigation';

import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROJECTS);

export default function LegacyProjectsPage() {
  redirect('/projects');
}

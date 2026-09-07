import { redirect } from 'next/navigation';
import React from 'react';

import { AppShell } from '~/components/app-shell/app-shell';
import { getAdminSession } from '~/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  if (!session) {
    redirect('/');
  }

  return <AppShell user={session.user}>{children}</AppShell>;
}

import { redirect } from 'next/navigation';
import React from 'react';

import { AuthShell } from '~/components/auth/auth-shell';
import { LoginForm } from '~/components/auth/login-form';
import { getAdminSession, getBootstrapStatus } from '~/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const bootstrapStatus = await getBootstrapStatus();

  if (!bootstrapStatus.initialized) {
    redirect('/install');
  }

  const session = await getAdminSession();
  if (session) {
    redirect('/inbox');
  }

  return (
    <AuthShell
      eyebrow="Portal Access"
      title="Enter the management console."
      description="Authenticate with operator credentials to oversee tenants, jobs, and platform records."
    >
      <LoginForm />
    </AuthShell>
  );
}

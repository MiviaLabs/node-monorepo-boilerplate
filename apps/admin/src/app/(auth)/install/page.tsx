import { redirect } from 'next/navigation';
import React from 'react';

import { AuthShell, AuthShellContentWidth } from '~/components/auth/auth-shell';
import { InstallForm } from '~/components/auth/install-form';
import { getBootstrapStatus } from '~/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function InstallPage() {
  const bootstrapStatus = await getBootstrapStatus();

  if (bootstrapStatus.initialized) {
    redirect('/');
  }

  return (
    <AuthShell
      eyebrow="Deployment Bootstrap"
      title="Set up your platform instance."
      description="Perform initial bootstrapping to provision the master tenant and root administrator."
      aside="Setup is strictly restricted once the primary system administrator is established."
      contentWidth={AuthShellContentWidth.Xl}
    >
      <InstallForm />
    </AuthShell>
  );
}

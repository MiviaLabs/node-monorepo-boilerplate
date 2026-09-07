import React from 'react';

import { AuthShell } from '~/components/auth/auth-shell';
import { ForgotPasswordForm } from '~/components/auth/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account Recovery"
      title="Recover operator access."
      description="Submit your authorized work email to receive password restoration directions."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}

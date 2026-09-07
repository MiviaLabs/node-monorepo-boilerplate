import Link from 'next/link';
import React from 'react';

import { AuthShell, AuthShellContentWidth } from '~/components/auth/auth-shell';
import { Button } from '~/components/ui/button';
import { InvitationPreviewFailureStatus, adminPublicAuthApi } from '~/lib/auth/public-api';

interface AcceptInvitationPageProps {
  searchParams: Promise<{
    token?: string;
    tenantId?: string;
  }>;
}

export default async function AcceptInvitationPage({ searchParams }: AcceptInvitationPageProps) {
  const params = await searchParams;
  const token = params.token?.trim();
  const tenantId = params.tenantId?.trim();

  if (!token || !tenantId) {
    return (
      <AuthShell
        eyebrow="Invitation Review"
        title="Invitation link is incomplete."
        description="This invitation is missing required details."
        contentWidth={AuthShellContentWidth.Xl}
      >
        <div className="w-full rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Ask the sender to share a fresh invitation link with both token and tenant context.
          </p>
          <Button asChild variant="outline" className="mt-4 h-9">
            <Link href="/">Return to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  try {
    const preview = await adminPublicAuthApi.getInvitationPreview(token, tenantId);

    return (
      <AuthShell
        eyebrow="Invitation Review"
        title="Review your invitation."
        description="Check the invitation details before continuing."
        contentWidth={AuthShellContentWidth.Xl}
      >
        <div className="w-full rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-5">
          <div className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">
              You are invited to join{' '}
              <span className="font-medium text-foreground">{preview.tenantName}</span>.
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Invited by{' '}
              <span className="font-medium text-foreground">{preview.inviterDisplayName}</span>
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Invitation sent to{' '}
              <span className="font-medium text-foreground">{preview.invitedEmailMasked}</span>
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              This admin currently supports operator login only. If this invite is for the main
              app, continue registration there instead of the admin.
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-9">
              <Link href="/">Go to sign in</Link>
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link href="/forgot-password">Need account help</Link>
            </Button>
          </div>
        </div>
      </AuthShell>
    );
  } catch (error) {
    const title =
      error instanceof Error &&
      'status' in error &&
      error.status === InvitationPreviewFailureStatus.EXPIRED
        ? 'Invitation expired.'
        : error instanceof Error &&
            'status' in error &&
            error.status === InvitationPreviewFailureStatus.CONSUMED
          ? 'Invitation already used.'
          : 'Invitation is not available.';

    return (
      <AuthShell
        eyebrow="Invitation Review"
        title={title}
        description={error instanceof Error ? error.message : 'Unable to load invitation details.'}
        contentWidth={AuthShellContentWidth.Xl}
      >
        <div className="w-full rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-5">
          <p className="text-sm leading-6 text-muted-foreground">
            Ask the sender to issue a new invitation if you still need access.
          </p>
          <Button asChild variant="outline" className="mt-4 h-9">
            <Link href="/">Return to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }
}

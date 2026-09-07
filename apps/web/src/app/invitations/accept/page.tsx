import Link from 'next/link';

import { AuthPageShell, ExistingAccountInvitationPanel, RegisterForm } from '~/components/auth';
import { Button } from '~/components/ui/button';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';
import { InvitationPreviewFailureStatus, type InvitationPreviewResponse } from '~/types/auth.types';

interface AcceptInvitationPageProps {
  searchParams: Promise<{
    token?: string;
    tenantId?: string;
  }>;
}

type PreviewState =
  | { status: 'valid'; data: InvitationPreviewResponse }
  | { status: InvitationPreviewFailureStatus; message: string };

async function loadInvitationPreview(token: string, tenantId: string): Promise<PreviewState> {
  const previewUrl = `${getVersionedApiBaseUrl('v1')}/iam/invitations/preview?token=${encodeURIComponent(
    token
  )}&tenantId=${encodeURIComponent(tenantId)}`;

  try {
    const response = await fetch(previewUrl, {
      cache: 'no-store'
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (response.ok) {
      const data = (payload.data ?? payload) as InvitationPreviewResponse;
      return { status: 'valid', data };
    }

    const message =
      typeof payload.message === 'string' && payload.message.length > 0
        ? payload.message
        : 'Invitation is not available.';
    const status =
      payload.status === InvitationPreviewFailureStatus.EXPIRED ||
      payload.status === InvitationPreviewFailureStatus.CONSUMED
        ? payload.status
        : InvitationPreviewFailureStatus.INVALID;

    return { status, message };
  } catch {
    return {
      status: InvitationPreviewFailureStatus.INVALID,
      message: 'Failed to load invitation details.'
    };
  }
}

export default async function AcceptInvitationPage({ searchParams }: AcceptInvitationPageProps) {
  const params = await searchParams;
  const token = params.token?.trim();
  const tenantId = params.tenantId?.trim();
  if (!token || !tenantId) {
    return (
      <AuthPageShell>
        <div className="w-full rounded-2xl border border-border/80 bg-card/92 p-6 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.3)] dark:shadow-[0_14px_28px_-22px_rgba(0,0,0,0.6)] animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90">
            INVITATION
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Invitation link is incomplete
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This invitation link is missing required details.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ask the sender to share a new invite link.
          </p>
          <Button
            asChild
            variant="outline"
            className="mt-4 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px"
          >
            <Link href="/register">Go to registration</Link>
          </Button>
        </div>
      </AuthPageShell>
    );
  }

  const previewState = await loadInvitationPreview(token, tenantId);

  if (previewState.status !== 'valid') {
    const title =
      previewState.status === InvitationPreviewFailureStatus.EXPIRED
        ? 'Invitation expired'
        : previewState.status === InvitationPreviewFailureStatus.CONSUMED
          ? 'Invitation already used'
          : 'Invalid invitation link';

    return (
      <AuthPageShell>
        <div className="w-full rounded-2xl border border-border/80 bg-card/92 p-6 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.3)] dark:shadow-[0_14px_28px_-22px_rgba(0,0,0,0.6)] animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/90">
            INVITATION
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{previewState.message}</p>
          <Button
            asChild
            variant="outline"
            className="mt-4 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px"
          >
            <Link href="/register">Go to registration</Link>
          </Button>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <section
        aria-label="Invitation details"
        className="w-full rounded-2xl border border-border/80 bg-card/92 p-5 text-sm text-foreground/85 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.3)] dark:shadow-[0_14px_28px_-22px_rgba(0,0,0,0.6)] animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
      >
        <p className="inline-flex rounded-full border border-border/70 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Workspace invite
        </p>
        <p className="mt-3 font-semibold text-foreground">
          You are invited to join {previewState.data.tenantName}
        </p>
        <p className="mt-1 text-muted-foreground">
          Invited by {previewState.data.inviterDisplayName}
        </p>
        <p className="mt-1 text-muted-foreground">
          Invitation sent to {previewState.data.invitedEmailMasked}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Verify this workspace and email before accepting the invitation.
        </p>
      </section>
      {previewState.data.acceptanceMode === 'existing_account' ? (
        <ExistingAccountInvitationPanel
          invitationToken={token}
          tenantId={tenantId}
          tenantName={previewState.data.tenantName}
          invitedEmailMasked={previewState.data.invitedEmailMasked}
        />
      ) : (
        <RegisterForm invitationToken={token} tenantId={tenantId} submitLabel="Accept Invitation" />
      )}
    </AuthPageShell>
  );
}

import React from 'react';

import { ProfileEditForm } from './profile-edit-form';

import { AppPage, AppPageWidth } from '~/components/app-shell/app-page';
import { PageHeader } from '~/components/app-shell/page-header';
import { ProfileSessionPanel } from '~/components/admin/profile-session-panel';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { getAdminCurrentUserSessions } from '~/lib/admin';
import { getAdminSession } from '~/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const [session, sessions] = await Promise.all([
    getAdminSession(),
    getAdminCurrentUserSessions()
  ]);

  if (!session) {
    return null;
  }

  const { user } = session;
  const displayName = user.displayName ?? user.name;
  const tenantDisplayName = user.tenantDisplayName ?? user.tenantName ?? user.tenantId;

  return (
    <AppPage width={AppPageWidth.Full} className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Profile"
        badge="Account"
        description="Review your operator identity and update the profile fields that are managed in admin."
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={`/api/auth/account/${user.userId}/export`} download>
              Download my account export
            </a>
          </Button>
        }
      />

      <Card className="premium-panel rounded-lg border-border/70">
        <CardHeader className="border-b border-border/70 pb-4">
          <Badge
            variant="secondary"
            className="w-fit rounded-md px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]"
          >
            Identity
          </Badge>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>
            Authoritative operator details resolved from the current authenticated profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 pt-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-14 w-14 border border-border/80">
              <AvatarFallback className="bg-primary/14 text-sm font-semibold text-foreground">
                {user.avatarFallback}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Operator</p>
              <p className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                {displayName}
              </p>
              <p className="text-sm text-muted-foreground">{user.role}</p>
            </div>
          </div>

          <ProfileEditForm
            key={`${displayName}:${user.phoneNumber ?? ''}`}
            initialDisplayName={displayName}
            initialPhoneNumber={user.phoneNumber ?? ''}
            email={user.email}
            roleLabel={user.role}
            roles={user.roles ?? []}
            tenantDisplayName={tenantDisplayName}
            tenantId={user.tenantId}
          />

          <div className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Data export
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Download the current operator account export as JSON. This action is policy-controlled
              and audited by the backend.
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-4">
            <ProfileSessionPanel sessions={sessions} />
          </div>
        </CardContent>
      </Card>
    </AppPage>
  );
}

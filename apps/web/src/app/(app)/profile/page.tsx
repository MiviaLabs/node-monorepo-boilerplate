import { Shield, UserCheck, UserCog } from 'lucide-react';

import { ChangePasswordForm } from '../dashboard/profile/change-password-form';
import { ProfileAddressesCard } from '../dashboard/profile/profile-addresses-card';
import { ProfileAvatarCard } from '../dashboard/profile/profile-avatar-card';
import { ProfileEditForm } from '../dashboard/profile/profile-edit-form';

import type { UserAddress } from '~/types/address.types';

import { SessionInfoCard } from '~/components/dashboard/session-info-card';
import { RolesPermissionsCard, UserInfoCard } from '~/components/dashboard/user-profile-card';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { getUserSession } from '~/lib/auth/get-user-session';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';
import { createServerTrpcClient } from '~/lib/trpc/create-server-trpc-client';

const ADDRESS_PERMISSIONS = [
  'tenant:user_addresses:create',
  'tenant:user_addresses:read',
  'tenant:user_addresses:update',
  'tenant:user_addresses:delete'
] as const;

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.PROFILE);

export default async function ProfilePage() {
  const { user, session } = await getUserSession();
  const trpcClient = await createServerTrpcClient();
  const parsedUserId = Number.parseInt(user.userId, 10);
  const hasNumericUserId = Number.isFinite(parsedUserId) && parsedUserId > 0;
  const permissions = new Set(user.permissions ?? []);
  const canManageAddresses = ADDRESS_PERMISSIONS.every((permission) => permissions.has(permission));
  const initialAddresses: UserAddress[] =
    hasNumericUserId && canManageAddresses
      ? await trpcClient.addresses.getUserAddresses.query({ userId: String(parsedUserId) })
      : [];
  const displayName = user.displayName ?? user.name ?? user.email ?? 'User';
  const roleCount = user.roles?.length ?? 0;
  const permissionCount = user.permissions?.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card className={`${enterpriseCardVariants()} border-none bg-transparent shadow-none`}>
        <CardContent className="px-1 py-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-foreground">{displayName}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="group flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-3 py-1.5 transition-[border-color,background-color,box-shadow] duration-150 hover:border-border/80 hover:bg-card/60 hover:shadow-xs">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 transition-[transform,background-color] duration-150 group-hover:scale-105 group-hover:bg-emerald-500/15 dark:text-emerald-400">
                  <UserCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Session
                  </p>
                  <Badge variant={session.authenticated ? 'default' : 'secondary'}>
                    {session.authenticated ? 'Authenticated' : 'Not authenticated'}
                  </Badge>
                </div>
              </div>

              <div className="group flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-3 py-1.5 transition-[border-color,background-color,box-shadow] duration-150 hover:border-border/80 hover:bg-card/60 hover:shadow-xs">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/20 transition-[transform,background-color] duration-150 group-hover:scale-105 group-hover:bg-blue-500/15 dark:text-blue-400">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Roles
                  </p>
                  <p className="text-sm font-semibold tracking-tight text-foreground">
                    {roleCount}
                  </p>
                </div>
              </div>

              <div className="group flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-3 py-1.5 transition-[border-color,background-color,box-shadow] duration-150 hover:border-border/80 hover:bg-card/60 hover:shadow-xs">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 transition-[transform,background-color] duration-150 group-hover:scale-105 group-hover:bg-amber-500/15 dark:text-amber-400">
                  <UserCog className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Permissions
                  </p>
                  <p className="text-sm font-semibold tracking-tight text-foreground">
                    {permissionCount}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <ProfileAvatarCard
          initialDisplayName={user.displayName ?? user.name ?? ''}
          initialEmail={user.email}
          initialPhotoUrl={user.photoUrl}
        />
        <ProfileEditForm
          key={`${user.displayName ?? user.name ?? ''}:${user.phoneNumber ?? ''}`}
          initialDisplayName={user.displayName ?? user.name ?? ''}
          initialPhoneNumber={user.phoneNumber ?? ''}
        />
        {hasNumericUserId && canManageAddresses ? (
          <ProfileAddressesCard userId={String(parsedUserId)} initialAddresses={initialAddresses} />
        ) : null}
        <ChangePasswordForm />
        <RolesPermissionsCard user={user} />
        <UserInfoCard user={user} />
        <SessionInfoCard session={session} />
      </div>
    </div>
  );
}

/**
 * User Profile Card Component
 *
 * Displays user information in a card format
 * Server component - renders with data from server
 */

import { Building2, Mail, Shield, User } from 'lucide-react';
import Link from 'next/link';

import { getDashboardRouteAccess } from './route-access';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { enterpriseCardVariants, enterpriseOutlineButtonClass } from '../ui/enterprise-styles';

import { type User as UserType } from '~/types/auth.types';

// ============================================================================
// TYPES
// ============================================================================

interface UserProfileCardProps {
  user: UserType;
}

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * User Information Card
 *
 * Displays user account details and metadata
 *
 * @param user - User object with profile information
 */
export function UserInfoCard({ user }: UserProfileCardProps) {
  const accountStatus = user.isActive === false ? 'Inactive' : 'Active';
  const verificationStatus = user.emailVerified ? 'Verified' : 'Not Verified';

  return (
    <Card
      className={`${enterpriseCardVariants()} transition-[border-color,background-color,box-shadow,transform] duration-200 hover:border-border/70 hover:bg-card hover:shadow-[0_10px_28px_-24px_rgba(15,23,42,0.35)]`}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <User className="h-5 w-5" />
          Account Profile
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Personal identification and status overview
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border border-border bg-muted/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">User ID</p>
            <p className="text-sm font-mono text-foreground">{user.userId}</p>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">Display Name</p>
            <p className="text-sm text-foreground">{user.displayName ?? 'N/A'}</p>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">Account Status</p>
            <Badge variant={user.isActive === false ? 'secondary' : 'default'}>
              {accountStatus}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">Email verification: {verificationStatus}</p>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Email</p>
          <p className="flex items-center gap-1 text-sm text-foreground">
            <Mail className="h-3 w-3" />
            {user.email}
          </p>
        </div>

        {user.username ? (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Username</p>
            <p className="text-sm text-foreground">{user.username}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Roles and Permissions Card
 *
 * Displays user access levels and assigned permissions
 *
 * @param user - User object with roles and permissions
 */
export function RolesPermissionsCard({ user }: UserProfileCardProps) {
  return (
    <Card
      className={`${enterpriseCardVariants()} transition-[border-color,background-color,box-shadow,transform] duration-200 hover:border-border/70 hover:bg-card hover:shadow-[0_10px_28px_-24px_rgba(15,23,42,0.35)]`}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Shield className="h-5 w-5" />
          Security & Access Grants
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Assigned workspace privileges and operational roles
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            Roles ({user.roles?.length ?? 0})
          </p>
          <div className="flex flex-wrap gap-2">
            {user.roles?.length > 0 ? (
              user.roles?.map((role: string) => (
                <Badge key={role} variant="outline">
                  {role}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No roles assigned</p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            Permissions ({user.permissions?.length ?? 0})
          </p>
          <div className="flex flex-wrap gap-2">
            {user.permissions?.length > 0 ? (
              user.permissions?.map((permission: string) => (
                <Badge key={permission} variant="secondary">
                  {permission}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No permissions assigned</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Tenant Information Card
 *
 * Displays organization/workspace details
 *
 * @param user - User object with tenant information
 */
export function TenantInfoCard({
  user,
  tenantId,
  tenantName,
  tenantDisplayName
}: UserProfileCardProps & {
  tenantId?: string | null;
  tenantName?: string | null;
  tenantDisplayName?: string | null;
}) {
  const { canManageOrganization, canViewMembers, canViewProjects } = getDashboardRouteAccess({
    roles: user.roles,
    permissions: user.permissions
  });

  return (
    <Card
      className={`${enterpriseCardVariants()} transition-[border-color,background-color,box-shadow,transform] duration-200 hover:border-border/70 hover:bg-card hover:shadow-[0_10px_28px_-24px_rgba(15,23,42,0.35)]`}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Building2 className="h-5 w-5" />
          Workspace Tenancy
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Organization boundaries and tenant parameters
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Display Name</p>
          <p className="text-sm">{tenantDisplayName?.trim() ?? ''}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground">Tenant Name (Read-only)</p>
          <p className="text-sm">{tenantName?.trim() ?? ''}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground">Tenant ID</p>
          <p className="text-sm font-mono">{tenantId ?? user.tenantId}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canViewProjects ? (
            <Button asChild variant="outline" size="sm" className={enterpriseOutlineButtonClass}>
              <Link href="/projects">Projects</Link>
            </Button>
          ) : null}
          {canViewMembers ? (
            <Button asChild variant="outline" size="sm" className={enterpriseOutlineButtonClass}>
              <Link href="/members">Members</Link>
            </Button>
          ) : null}
          {canManageOrganization ? (
            <Button asChild variant="outline" size="sm" className={enterpriseOutlineButtonClass}>
              <Link href="/settings">Open Settings</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Tenant and Member Management Types
 */

/**
 * Tenant member roles
 */
export const TENANT_ROLES = {
  OWNER: 'tenant_owner',
  ADMIN: 'tenant_admin',
  USER: 'tenant_user',
  VIEWER: 'tenant_viewer'
} as const;

export type TenantRole = (typeof TENANT_ROLES)[keyof typeof TENANT_ROLES];

/**
 * Tenant member status
 */
export const enum MemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

/**
 * Tenant status
 */
export const enum TenantStatus {
  DRAFT = 'draft',
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted'
}

/**
 * Tenant member information
 */
export interface TenantMember {
  id: string;
  userId: string;
  invitationId?: string;
  tenantId: string;
  email: string;
  displayName?: string;
  photoUrl?: string | null;
  role: TenantRole;
  status: MemberStatus;
  isActive: boolean;
  isDefault: boolean;
  joinedAt: string;
  updatedAt?: string;
  permissions?: string[];
}

/**
 * Paginated members response
 */
export interface MembersResponse {
  data: TenantMember[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

/**
 * Invite member input
 */
export interface InviteMemberInput {
  email: string;
  roles?: TenantRole[];
  message?: string;
}

/**
 * Invite member response
 */
export interface InviteMemberResponse {
  memberId: string;
  email: string;
  invitationToken?: string;
  status: string;
}

/**
 * Update member role input
 */
export interface UpdateMemberRoleInput {
  memberId: string;
  role: TenantRole;
}

/**
 * Update member status input
 */
export interface UpdateMemberStatusInput {
  memberId: string;
  status: MemberStatus;
}

/**
 * Member filters
 */
export const enum SortByField {
  EMAIL = 'email',
  DISPLAY_NAME = 'displayName',
  ROLE = 'role',
  JOINED_AT = 'joinedAt',
  STATUS = 'status'
}

export const enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

export interface MemberFilters {
  search?: string;
  role?: TenantRole;
  status?: MemberStatus;
  sortBy?: SortByField;
  sortOrder?: SortOrder;
}

/**
 * Role display configuration
 */
export const enum BadgeVariant {
  DEFAULT = 'default',
  SECONDARY = 'secondary',
  DESTRUCTIVE = 'destructive',
  OUTLINE = 'outline'
}

export const ROLE_DISPLAY: Record<
  TenantRole,
  { label: string; color: BadgeVariant; description: string }
> = {
  tenant_owner: {
    label: 'Owner',
    color: BadgeVariant.DEFAULT,
    description: 'Full access to all tenant resources and settings'
  },
  tenant_admin: {
    label: 'Admin',
    color: BadgeVariant.SECONDARY,
    description: 'Manage users, settings, and most tenant resources'
  },
  tenant_user: {
    label: 'User',
    color: BadgeVariant.OUTLINE,
    description: 'Standard access to tenant resources'
  },
  tenant_viewer: {
    label: 'Viewer',
    color: BadgeVariant.OUTLINE,
    description: 'Read-only access to tenant resources'
  }
};

/**
 * Status display configuration
 */
export const STATUS_DISPLAY: Record<MemberStatus, { label: string; variant: BadgeVariant }> = {
  [MemberStatus.ACTIVE]: { label: 'Active', variant: BadgeVariant.DEFAULT },
  [MemberStatus.INACTIVE]: { label: 'Inactive', variant: BadgeVariant.SECONDARY },
  [MemberStatus.SUSPENDED]: { label: 'Suspended', variant: BadgeVariant.DESTRUCTIVE },
  [MemberStatus.PENDING]: { label: 'Pending', variant: BadgeVariant.OUTLINE }
};

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  asc,
  and,
  count,
  desc,
  eq,
  invitations,
  isNull,
  organizations,
  or,
  tenants,
  userIdentities,
  userTenants,
  users,
  type SQL,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';
import { sql } from 'drizzle-orm';

import { UpdateTenantSettingsDto, InviteMemberDto } from '../dto';
import { buildTenantAuditEvent } from '../events/tenant-audit-event';
import {
  MemberRoleFilter,
  MemberStatusFilter,
  MembersSortBy,
  MembersSortOrder
} from '../queries/get-members.query';
import { InvitationRepository } from '../repositories/invitation.repository';

import { MAIN_DB } from '@/common/database/database.constants';
import { ApiException } from '@/common/errors';
import { AvatarUrlResolverService } from '@/modules/auth/services';

const MEMBER_EMAIL_DECRYPTION_CONCURRENCY = 20;
const enum MemberEmailSubjectKind {
  MEMBER = 'member',
  INVITATION = 'invitation'
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: Array<R | undefined> = [];
  results.length = items.length;
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  });

  await Promise.all(workers);
  return results.map((result) => {
    if (result === undefined) {
      throw new Error('Concurrent mapping produced an unexpected empty result');
    }
    return result;
  });
}

type MemberRecord = {
  id: string;
  invitationId?: string;
  userId: string;
  tenantId: string;
  email: string;
  displayName?: string;
  photoUrl?: string | null;
  role: string;
  status: string;
  isActive: boolean;
  isDefault: boolean;
  joinedAt?: string;
  updatedAt?: string;
};

type MemberPageResult = {
  data: MemberRecord[];
  metadata: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  };
};

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @Inject(MAIN_DB) private readonly db: NodePgDatabase,
    private readonly invitationRepository: InvitationRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly avatarUrlResolver: AvatarUrlResolverService
  ) {}

  async getCurrentTenant(
    tenantId?: string,
    actorId?: string,
    requestId?: string,
    correlationId?: string,
    causationId?: string
  ): Promise<unknown> {
    if (!tenantId) {
      throw ApiException.missingRequiredHeader('x-tenant-id');
    }

    const organizationId = Number.parseInt(tenantId, 10);
    if (Number.isNaN(organizationId) || organizationId <= 0) {
      throw new Error(`Invalid tenantId: ${tenantId}`);
    }

    this.logger.debug(`Fetching current tenant settings for organization ${organizationId}`);

    const [organization] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, organization.tenantId))
      .limit(1);

    if (!tenant) {
      throw new Error(`Tenant not found for organization: ${organizationId}`);
    }

    const result = {
      id: organization.id,
      name: organization.name,
      displayName: organization.displayName,
      slug: organization.slug,
      status: tenant.status,
      settings: (tenant.settings as Record<string, unknown>) ?? {},
      createdAt: organization.createdAt.toISOString()
    };

    await this.recordAuditEvent({
      eventType: 'tenant.settings.viewed.audit',
      tenantId: organizationId,
      actorId,
      requestId,
      correlationId,
      causationId,
      action: 'VIEW_TENANT_SETTINGS'
    });

    return result;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async updateSettings(updateDto: UpdateTenantSettingsDto): Promise<unknown> {
    this.logger.log('Updating tenant settings');

    return {
      id: 1,
      ...updateDto,
      updatedAt: new Date().toISOString()
    };
  }

  async getMembers(queryDto: {
    tenantId?: string;
    actorId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
    page?: number;
    pageSize?: number;
    search?: string;
    role?: MemberRoleFilter;
    status?: MemberStatusFilter;
    sortBy?: MembersSortBy;
    sortOrder?: MembersSortOrder;
  }): Promise<unknown> {
    const parsedPage = Number(queryDto.page ?? 1);
    const parsedPageSize = Number(queryDto.pageSize ?? 20);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
    const pageSize =
      Number.isFinite(parsedPageSize) && parsedPageSize > 0
        ? Math.min(100, Math.floor(parsedPageSize))
        : 20;
    const tenantId = queryDto.tenantId;
    const search = queryDto.search?.trim().toLowerCase();
    const roleFilter = queryDto.role ? String(queryDto.role) : undefined;
    const statusFilter = queryDto.status ? String(queryDto.status) : undefined;
    const sortBy = queryDto.sortBy ?? MembersSortBy.JOINED_AT;
    const sortOrder = queryDto.sortOrder ?? MembersSortOrder.DESC;

    if (!tenantId) {
      throw ApiException.missingRequiredHeader('x-tenant-id');
    }

    const organizationId = Number.parseInt(tenantId, 10);
    if (Number.isNaN(organizationId) || organizationId <= 0) {
      throw new Error(`Invalid tenantId: ${tenantId}`);
    }

    this.logger.debug(
      `Fetching tenant members for organization ${organizationId} - page ${page}, size ${pageSize}`
    );

    const [organization] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return this.buildMembersResult([], page, pageSize, 0);
    }

    const listParams = {
      organizationId,
      tenantId: organization.tenantId,
      ownerId: organization.ownerId,
      page,
      pageSize,
      search,
      roleFilter,
      statusFilter,
      sortBy,
      sortOrder
    };
    let result = this.requiresLegacyMemberListing(search, sortBy)
      ? await this.listMembersLegacy(listParams)
      : await this.listMembersPageShaped(listParams);

    if (search && sortBy !== MembersSortBy.EMAIL && result.metadata.pagination.total === 0) {
      result = await this.listMembersLegacy(listParams);
    }

    await this.recordMembersListedAuditEvent({
      tenantId: organizationId,
      actorId: queryDto.actorId,
      requestId: queryDto.requestId,
      correlationId: queryDto.correlationId,
      causationId: queryDto.causationId,
      page,
      pageSize,
      total: result.metadata.pagination.total,
      resultCount: result.data.length,
      searchApplied: Boolean(search),
      roleFilter,
      statusFilter,
      sortBy,
      sortOrder
    });

    return result;
  }

  inviteMember(_inviteDto: InviteMemberDto): Promise<never> {
    return Promise.reject(
      new Error('InviteMemberCommand must be used for tenant invitation workflows')
    );
  }

  async generateInvitationLink(queryDto: {
    tenantId?: string;
    actorId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
    invitationId: string;
  }): Promise<{ invitationId: string; invitationToken: string }> {
    const tenantId = queryDto.tenantId;
    if (!tenantId) {
      throw ApiException.missingRequiredHeader('x-tenant-id');
    }

    const organizationId = Number.parseInt(tenantId, 10);
    const invitationId = Number.parseInt(queryDto.invitationId, 10);
    if (Number.isNaN(organizationId) || organizationId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'tenantId',
        expectedType: 'positive integer'
      });
    }
    if (Number.isNaN(invitationId) || invitationId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'invitationId',
        expectedType: 'positive integer'
      });
    }

    return this.db.transaction(async (tx) => {
      const invitationToken = await this.invitationRepository.rotatePendingTokenWithTransaction(
        tx,
        organizationId,
        invitationId
      );
      if (!invitationToken) {
        throw Errors.databaserecordNotFound004({ entity: 'Invitation' });
      }

      await this.outboxRepo.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.invitation.link.generated.audit',
          tenantId: organizationId,
          actorId: queryDto.actorId,
          requestId: queryDto.requestId,
          aggregateId: invitationId,
          action: 'GENERATE_INVITATION_LINK',
          details: {
            invitationId: String(invitationId)
          },
          correlationId: queryDto.correlationId,
          causationId: queryDto.causationId
        })
      );

      return {
        invitationId: String(invitationId),
        invitationToken
      };
    });
  }

  async revokeInvitation(queryDto: {
    tenantId?: string;
    actorId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
    invitationId: string;
  }): Promise<void> {
    const tenantId = queryDto.tenantId;
    if (!tenantId) {
      throw ApiException.missingRequiredHeader('x-tenant-id');
    }

    const organizationId = Number.parseInt(tenantId, 10);
    const invitationId = Number.parseInt(queryDto.invitationId, 10);
    if (Number.isNaN(organizationId) || organizationId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'tenantId',
        expectedType: 'positive integer'
      });
    }
    if (Number.isNaN(invitationId) || invitationId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'invitationId',
        expectedType: 'positive integer'
      });
    }

    return this.db.transaction(async (tx) => {
      const cancelled = await this.invitationRepository.markAsCancelledWithTransaction(
        tx,
        organizationId,
        invitationId
      );

      if (!cancelled) {
        throw Errors.databaserecordNotFound004({ entity: 'Invitation' });
      }

      await this.outboxRepo.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.invitation.revoked.audit',
          tenantId: organizationId,
          actorId: queryDto.actorId,
          requestId: queryDto.requestId,
          aggregateId: invitationId,
          action: 'REVOKE_INVITATION',
          details: {
            invitationId: String(invitationId)
          },
          correlationId: queryDto.correlationId,
          causationId: queryDto.causationId
        })
      );
    });
  }

  private async listMembersLegacy(params: {
    organizationId: number;
    tenantId: number;
    ownerId: number | null;
    page: number;
    pageSize: number;
    search?: string;
    roleFilter?: string;
    statusFilter?: string;
    sortBy: MembersSortBy;
    sortOrder: MembersSortOrder;
  }): Promise<MemberPageResult> {
    const pendingInvitations = await this.db
      .select({
        invitationId: invitations.id,
        organizationId: invitations.organizationId,
        role: invitations.role,
        createdAt: invitations.createdAt,
        updatedAt: invitations.updatedAt,
        emailEncrypted: invitations.emailEncrypted
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, params.organizationId),
          eq(invitations.status, 'pending')
        )
      )
      .orderBy(desc(invitations.createdAt));

    const rows = await this.db
      .select({
        userId: users.id,
        userDisplayName: users.displayName,
        userPhotoUrl: users.photoUrl,
        userAvatarFileId: users.avatarFileId,
        userEmail: users.emailEncrypted,
        userIsActive: users.isActive,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
        membershipRole: userTenants.role,
        membershipIsActive: userTenants.isActive,
        membershipIsDefault: userTenants.isDefault,
        membershipCreatedAt: userTenants.createdAt,
        membershipUpdatedAt: userTenants.updatedAt,
        identityEmail: userIdentities.providerEmailEncrypted,
        identityDisplayName: userIdentities.displayName
      })
      .from(users)
      .leftJoin(
        userTenants,
        and(eq(userTenants.userId, users.id), eq(userTenants.tenantId, params.tenantId))
      )
      .leftJoin(
        userIdentities,
        and(eq(userIdentities.userId, users.id), eq(userIdentities.isPrimary, true))
      )
      .where(
        and(
          or(
            eq(users.organizationId, params.organizationId),
            eq(userTenants.tenantId, params.tenantId)
          ),
          isNull(users.deletedAt)
        )
      )
      .orderBy(desc(users.createdAt));

    const pendingInvitationData = await mapWithConcurrency(
      pendingInvitations,
      MEMBER_EMAIL_DECRYPTION_CONCURRENCY,
      async (invitation) => {
        const email = await this.decryptMemberEmail(
          params.organizationId,
          invitation.emailEncrypted,
          MemberEmailSubjectKind.INVITATION,
          invitation.invitationId
        );
        const invitationId = String(invitation.invitationId);
        return {
          id: `invitation-${invitationId}`,
          invitationId,
          userId: `invitation-${invitationId}`,
          tenantId: String(invitation.organizationId),
          email,
          displayName: undefined,
          role: invitation.role ?? 'tenant_user',
          status: 'pending',
          isActive: false,
          isDefault: false,
          joinedAt: invitation.createdAt.toISOString(),
          updatedAt: invitation.updatedAt.toISOString()
        };
      }
    );

    const memberRows = rows.map((row) => {
      const role =
        row.membershipRole ?? (params.ownerId === row.userId ? 'tenant_owner' : 'tenant_user');
      const activeMembership = row.membershipIsActive ?? true;
      const isActive = Boolean(row.userIsActive && activeMembership);
      return {
        row,
        role,
        status: isActive ? 'active' : 'inactive',
        isActive
      };
    });

    const photoUrlByUserId = await this.avatarUrlResolver.resolvePhotoUrls(
      String(params.organizationId),
      memberRows.map(({ row }) => ({
        id: row.userId,
        avatarFileId: row.userAvatarFileId ?? null,
        photoUrl: row.userPhotoUrl ?? null
      }))
    );

    const memberData = await mapWithConcurrency(
      memberRows,
      MEMBER_EMAIL_DECRYPTION_CONCURRENCY,
      async ({ row, role, status, isActive }) => ({
        id: String(row.userId),
        userId: String(row.userId),
        tenantId: String(params.organizationId),
        email: await this.decryptMemberEmail(
          params.organizationId,
          row.identityEmail ?? row.userEmail,
          MemberEmailSubjectKind.MEMBER,
          row.userId
        ),
        displayName: row.userDisplayName ?? row.identityDisplayName ?? 'User',
        photoUrl: photoUrlByUserId.get(row.userId) ?? row.userPhotoUrl ?? null,
        role,
        status,
        isActive,
        isDefault: Boolean(row.membershipIsDefault ?? false),
        joinedAt: (row.membershipCreatedAt ?? row.userCreatedAt).toISOString(),
        updatedAt: (row.membershipUpdatedAt ?? row.userUpdatedAt).toISOString()
      })
    );

    const allMembers = [...pendingInvitationData, ...memberData];
    const filteredMembers = allMembers
      .filter((member) => (params.roleFilter ? member.role === params.roleFilter : true))
      .filter((member) => (params.statusFilter ? member.status === params.statusFilter : true))
      .filter((member) => {
        if (!params.search) return true;
        const haystack =
          `${member.displayName ?? ''} ${member.email ?? ''} ${member.role}`.toLowerCase();
        return haystack.includes(params.search);
      });

    const sortedMembers = [...filteredMembers].sort((a, b) =>
      this.compareListedMembers(a, b, params.sortBy, params.sortOrder)
    );
    const offset = (params.page - 1) * params.pageSize;

    return this.buildMembersResult(
      sortedMembers.slice(offset, offset + params.pageSize),
      params.page,
      params.pageSize,
      sortedMembers.length
    );
  }

  private async listMembersPageShaped(params: {
    organizationId: number;
    tenantId: number;
    ownerId: number | null;
    page: number;
    pageSize: number;
    search?: string;
    roleFilter?: string;
    statusFilter?: string;
    sortBy: MembersSortBy;
    sortOrder: MembersSortOrder;
  }): Promise<MemberPageResult> {
    const offset = (params.page - 1) * params.pageSize;
    const windowSize = offset + params.pageSize;
    const memberRoleExpression = this.buildMemberRoleExpression(params.ownerId);
    const memberStatusExpression = this.buildMemberStatusExpression();
    const memberDisplayNameExpression = this.buildMemberDisplayNameExpression();
    const memberJoinedAtExpression = this.buildMemberJoinedAtExpression();
    const memberConditions = this.buildMemberListConditions(
      params.organizationId,
      params.tenantId,
      params.search,
      params.roleFilter,
      params.statusFilter,
      memberDisplayNameExpression,
      memberRoleExpression,
      memberStatusExpression
    );
    const invitationConditions = this.buildInvitationListConditions(
      params.organizationId,
      params.search,
      params.roleFilter,
      params.statusFilter
    );

    const [memberCountRow, invitationCountRow, pendingInvitations, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(users)
        .leftJoin(
          userTenants,
          and(eq(userTenants.userId, users.id), eq(userTenants.tenantId, params.tenantId))
        )
        .where(and(...memberConditions)),
      invitationConditions.length === 0
        ? Promise.resolve([{ count: 0 }])
        : this.db
            .select({ count: count() })
            .from(invitations)
            .where(and(...invitationConditions)),
      invitationConditions.length === 0
        ? Promise.resolve([])
        : this.db
            .select({
              invitationId: invitations.id,
              organizationId: invitations.organizationId,
              role: invitations.role,
              createdAt: invitations.createdAt,
              updatedAt: invitations.updatedAt,
              emailEncrypted: invitations.emailEncrypted
            })
            .from(invitations)
            .where(and(...invitationConditions))
            .orderBy(
              ...this.buildInvitationOrderBy(
                params.sortBy,
                params.sortOrder,
                sql<string>`coalesce(${invitations.role}, 'tenant_user')`
              )
            )
            .limit(windowSize),
      this.db
        .select({
          userId: users.id,
          userDisplayName: users.displayName,
          userPhotoUrl: users.photoUrl,
          userAvatarFileId: users.avatarFileId,
          userEmail: users.emailEncrypted,
          userUpdatedAt: users.updatedAt,
          membershipIsDefault: userTenants.isDefault,
          membershipUpdatedAt: userTenants.updatedAt,
          identityEmail: userIdentities.providerEmailEncrypted,
          identityDisplayName: userIdentities.displayName,
          membershipRole: memberRoleExpression,
          membershipStatus: memberStatusExpression,
          membershipJoinedAt: memberJoinedAtExpression,
          membershipDisplayName: memberDisplayNameExpression
        })
        .from(users)
        .leftJoin(
          userTenants,
          and(eq(userTenants.userId, users.id), eq(userTenants.tenantId, params.tenantId))
        )
        .leftJoin(
          userIdentities,
          and(eq(userIdentities.userId, users.id), eq(userIdentities.isPrimary, true))
        )
        .where(and(...memberConditions))
        .orderBy(
          ...this.buildMemberOrderBy(
            params.sortBy,
            params.sortOrder,
            memberDisplayNameExpression,
            memberRoleExpression,
            memberStatusExpression,
            memberJoinedAtExpression
          )
        )
        .limit(windowSize)
    ]);

    const invitationCandidates = pendingInvitations.map((invitation) => ({
      kind: 'invitation' as const,
      invitationId: invitation.invitationId,
      tenantId: invitation.organizationId,
      emailEncrypted: invitation.emailEncrypted,
      displayName: undefined,
      role: invitation.role ?? 'tenant_user',
      status: 'pending',
      isActive: false,
      isDefault: false,
      joinedAt: invitation.createdAt.toISOString(),
      updatedAt: invitation.updatedAt.toISOString()
    }));
    const memberCandidates = rows.map((row) => ({
      kind: 'member' as const,
      userId: row.userId,
      tenantId: params.organizationId,
      emailEncrypted: row.identityEmail ?? row.userEmail,
      displayName: row.membershipDisplayName,
      avatarFileId: row.userAvatarFileId ?? null,
      photoUrl: row.userPhotoUrl ?? null,
      role: row.membershipRole,
      status: row.membershipStatus,
      isActive: row.membershipStatus === 'active',
      isDefault: Boolean(row.membershipIsDefault ?? false),
      joinedAt: this.toIsoString(row.membershipJoinedAt),
      updatedAt: this.toIsoString(row.membershipUpdatedAt ?? row.userUpdatedAt)
    }));
    const candidates = [...invitationCandidates, ...memberCandidates].sort((a, b) =>
      this.compareListedMembers(a, b, params.sortBy, params.sortOrder)
    );
    const total = Number(memberCountRow[0]?.count ?? 0) + Number(invitationCountRow[0]?.count ?? 0);
    const pageCandidates = candidates.slice(offset, offset + params.pageSize);

    const photoUrlByUserId = await this.avatarUrlResolver.resolvePhotoUrls(
      String(params.organizationId),
      pageCandidates
        .filter(
          (candidate): candidate is (typeof memberCandidates)[number] => candidate.kind === 'member'
        )
        .map((candidate) => ({
          id: candidate.userId,
          avatarFileId: candidate.avatarFileId,
          photoUrl: candidate.photoUrl
        }))
    );

    const data = await mapWithConcurrency(
      pageCandidates,
      MEMBER_EMAIL_DECRYPTION_CONCURRENCY,
      async (candidate) => {
        if (candidate.kind === 'invitation') {
          const invitationId = String(candidate.invitationId);
          return {
            id: `invitation-${invitationId}`,
            invitationId,
            userId: `invitation-${invitationId}`,
            tenantId: String(candidate.tenantId),
            email: await this.decryptMemberEmail(
              params.organizationId,
              candidate.emailEncrypted,
              MemberEmailSubjectKind.INVITATION,
              candidate.invitationId
            ),
            displayName: undefined,
            role: candidate.role,
            status: candidate.status,
            isActive: candidate.isActive,
            isDefault: candidate.isDefault,
            joinedAt: candidate.joinedAt,
            updatedAt: candidate.updatedAt
          } satisfies MemberRecord;
        }

        return {
          id: String(candidate.userId),
          userId: String(candidate.userId),
          tenantId: String(candidate.tenantId),
          email: await this.decryptMemberEmail(
            params.organizationId,
            candidate.emailEncrypted,
            MemberEmailSubjectKind.MEMBER,
            candidate.userId
          ),
          displayName: candidate.displayName,
          photoUrl: photoUrlByUserId.get(candidate.userId) ?? candidate.photoUrl,
          role: candidate.role,
          status: candidate.status,
          isActive: candidate.isActive,
          isDefault: candidate.isDefault,
          joinedAt: candidate.joinedAt,
          updatedAt: candidate.updatedAt
        } satisfies MemberRecord;
      }
    );

    return this.buildMembersResult(data, params.page, params.pageSize, total);
  }

  private buildMemberRoleExpression(ownerId: number | null): SQL<string> {
    return sql<string>`
      case
        when ${userTenants.role} is not null then ${userTenants.role}
        when ${ownerId ?? -1} = ${users.id} then 'tenant_owner'
        else 'tenant_user'
      end
    `;
  }

  private buildMemberStatusExpression(): SQL<string> {
    return sql<string>`
      case
        when ${users.isActive} = true and coalesce(${userTenants.isActive}, true) = true
          then 'active'
        else 'inactive'
      end
    `;
  }

  private buildMemberDisplayNameExpression(): SQL<string> {
    return sql<string>`coalesce(${users.displayName}, ${userIdentities.displayName}, 'User')`;
  }

  private buildMemberJoinedAtExpression(): SQL<Date> {
    return sql<Date>`coalesce(${userTenants.createdAt}, ${users.createdAt})`;
  }

  private buildMemberListConditions(
    organizationId: number,
    tenantId: number,
    search: string | undefined,
    roleFilter: string | undefined,
    statusFilter: string | undefined,
    displayNameExpression: SQL<string>,
    roleExpression: SQL<string>,
    statusExpression: SQL<string>
  ): SQL[] {
    return [
      or(eq(users.organizationId, organizationId), eq(userTenants.tenantId, tenantId)) as SQL,
      isNull(users.deletedAt) as SQL,
      ...(search
        ? [
            sql`(
              lower(${displayNameExpression}) like ${`%${search}%`}
              or lower(${roleExpression}) like ${`%${search}%`}
            )`
          ]
        : []),
      ...(roleFilter ? [sql`${roleExpression} = ${roleFilter}`] : []),
      ...(statusFilter ? [sql`${statusExpression} = ${statusFilter}`] : [])
    ];
  }

  private buildInvitationListConditions(
    organizationId: number,
    search: string | undefined,
    roleFilter: string | undefined,
    statusFilter: string | undefined
  ): SQL[] {
    if (statusFilter && statusFilter !== String(MemberStatusFilter.PENDING)) {
      return [];
    }

    return [
      eq(invitations.organizationId, organizationId) as SQL,
      eq(invitations.status, 'pending') as SQL,
      ...(search
        ? [sql`lower(coalesce(${invitations.role}, 'tenant_user')) like ${`%${search}%`}`]
        : []),
      ...(roleFilter ? [eq(invitations.role, roleFilter) as SQL] : [])
    ];
  }

  private requiresLegacyMemberListing(search: string | undefined, sortBy: MembersSortBy): boolean {
    return sortBy === MembersSortBy.EMAIL || this.isEmailLikeSearch(search);
  }

  private isEmailLikeSearch(search: string | undefined): boolean {
    return typeof search === 'string' && search.includes('@');
  }

  private buildMemberOrderBy(
    sortBy: MembersSortBy,
    sortOrder: MembersSortOrder,
    displayNameExpression: SQL<string>,
    roleExpression: SQL<string>,
    statusExpression: SQL<string>,
    joinedAtExpression: SQL<Date>
  ): SQL[] {
    const direction = sortOrder === MembersSortOrder.ASC ? asc : desc;

    if (sortBy === MembersSortBy.DISPLAY_NAME) {
      return [direction(sql`lower(${displayNameExpression})`), direction(users.id)];
    }
    if (sortBy === MembersSortBy.ROLE) {
      return [direction(roleExpression), direction(users.id)];
    }
    if (sortBy === MembersSortBy.STATUS) {
      return [direction(statusExpression), direction(users.id)];
    }

    return [direction(joinedAtExpression), direction(users.id)];
  }

  private buildInvitationOrderBy(
    sortBy: MembersSortBy,
    sortOrder: MembersSortOrder,
    roleExpression: SQL<string>
  ): SQL[] {
    const direction = sortOrder === MembersSortOrder.ASC ? asc : desc;

    if (sortBy === MembersSortBy.DISPLAY_NAME) {
      return [direction(sql<string>`''`), direction(invitations.id)];
    }
    if (sortBy === MembersSortBy.ROLE) {
      return [direction(roleExpression), direction(invitations.id)];
    }
    if (sortBy === MembersSortBy.STATUS) {
      return [direction(sql<string>`'pending'`), direction(invitations.id)];
    }

    return [direction(invitations.createdAt), direction(invitations.id)];
  }

  private compareListedMembers(
    a: { displayName?: string; role: string; status: string; joinedAt?: string },
    b: { displayName?: string; role: string; status: string; joinedAt?: string },
    sortBy: MembersSortBy,
    sortOrder: MembersSortOrder
  ): number {
    const direction = sortOrder === MembersSortOrder.ASC ? 1 : -1;

    if (sortBy === MembersSortBy.JOINED_AT) {
      const aValue = new Date(a.joinedAt ?? '').getTime();
      const bValue = new Date(b.joinedAt ?? '').getTime();
      return (aValue - bValue) * direction;
    }

    const getStringValue = (member: {
      displayName?: string;
      role: string;
      status: string;
    }): string => {
      if (sortBy === MembersSortBy.DISPLAY_NAME) return member.displayName ?? '';
      if (sortBy === MembersSortBy.ROLE) return member.role;
      return member.status;
    };

    return (
      getStringValue(a).localeCompare(getStringValue(b), undefined, {
        sensitivity: 'base'
      }) * direction
    );
  }

  private async decryptMemberEmail(
    organizationId: number,
    encryptedEmail: string | null,
    kind: MemberEmailSubjectKind,
    subjectId: number
  ): Promise<string> {
    if (!encryptedEmail) {
      return '';
    }

    if (!encryptedEmail.includes(':')) {
      return encryptedEmail.includes('@') ? encryptedEmail : '';
    }

    try {
      return await this.invitationRepository.decryptEmail(encryptedEmail);
    } catch {
      this.logger.warn(
        `Failed to decrypt ${kind} email for ${kind}Id=${subjectId}, organizationId=${organizationId}`
      );
      return '';
    }
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private buildMembersResult(
    data: MemberRecord[],
    page: number,
    pageSize: number,
    total: number
  ): MemberPageResult {
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
    return {
      data,
      metadata: {
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1
        }
      }
    };
  }

  private async recordMembersListedAuditEvent(params: {
    tenantId: number;
    actorId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
    page: number;
    pageSize: number;
    total: number;
    resultCount: number;
    searchApplied: boolean;
    roleFilter?: string;
    statusFilter?: string;
    sortBy: MembersSortBy;
    sortOrder: MembersSortOrder;
  }): Promise<void> {
    await this.recordAuditEvent({
      eventType: 'tenant.members.listed.audit',
      tenantId: params.tenantId,
      actorId: params.actorId,
      requestId: params.requestId,
      correlationId: params.correlationId,
      causationId: params.causationId,
      action: 'LIST_TENANT_MEMBERS',
      details: {
        page: params.page,
        pageSize: params.pageSize,
        totalCount: params.total,
        resultCount: params.resultCount,
        searchApplied: params.searchApplied,
        roleFilter: params.roleFilter,
        statusFilter: params.statusFilter,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder
      }
    });
  }

  private async recordAuditEvent(params: {
    eventType: string;
    tenantId: number;
    actorId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
    action: string;
    aggregateId?: string | number;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.outboxRepo.insert(
        tx,
        buildTenantAuditEvent({
          eventType: params.eventType,
          tenantId: params.tenantId,
          actorId: params.actorId,
          requestId: params.requestId,
          aggregateId: params.aggregateId,
          action: params.action,
          details: params.details,
          correlationId: params.correlationId,
          causationId: params.causationId
        })
      );
    });
  }
}

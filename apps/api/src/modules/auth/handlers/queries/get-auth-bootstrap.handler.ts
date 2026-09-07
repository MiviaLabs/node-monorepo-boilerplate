import { Injectable } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { AuthBootstrapResponseDto, UserOrganizationDto } from '../../dto';
import { GetAuthBootstrapQuery } from '../../queries/get-auth-bootstrap.query';
import { AuthRepository } from '../../repositories/auth.repository';
import { UserOrganizationSettingsRepository } from '../../repositories/user-organization-settings.repository';
import { UserProfileViewService } from '../../services/user-profile-view.service';
import { buildCurrentUserSettings } from '../../user-settings.constants';

import { measurePhase0 } from '@/common/services/phase-zero-diagnostics.service';

@QueryHandler(GetAuthBootstrapQuery)
@Injectable()
export class GetAuthBootstrapHandler implements IQueryHandler<GetAuthBootstrapQuery> {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly userOrganizationSettingsRepository: UserOrganizationSettingsRepository,
    private readonly userProfileViewService: UserProfileViewService
  ) {}

  async execute(query: GetAuthBootstrapQuery): Promise<AuthBootstrapResponseDto> {
    return measurePhase0(
      'api.auth.get_bootstrap.handler',
      {
        tenantIdPresent: Boolean(query.tenantId),
        requestId: query.requestId,
        correlationId: query.correlationId,
        causationId: query.causationId
      },
      async () => {
        const userIdNum = Number(query.userId);
        if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
          throw Errors.validationinvalidValueFor002({
            field: 'userId',
            expectedType: 'positive integer'
          });
        }

        const organizationId = Number(query.tenantId);
        if (!Number.isInteger(organizationId) || organizationId <= 0) {
          throw Errors.validationinvalidValueFor002({
            field: 'tenantId',
            expectedType: 'positive integer'
          });
        }

        const user = await this.authRepository.findById(query.tenantId, userIdNum);
        if (!user?.isActive) {
          throw Errors.useruserWithId001({ userId: query.userId });
        }

        const [resolvedOrganization, organizations, profile] = await Promise.all([
          this.authRepository.findOrganizationById(organizationId),
          this.authRepository.listUserOrganizations(userIdNum).then((memberships) =>
            memberships.map<UserOrganizationDto>((organization) => ({
              organizationId: organization.organizationId,
              tenantId: organization.tenantId,
              name: organization.name,
              ...(organization.displayName ? { displayName: organization.displayName } : {}),
              slug: organization.slug,
              role: organization.role,
              isDefault: organization.isDefault,
              isActive: organization.isActive
            }))
          ),
          this.userProfileViewService.build({
            tenantId: query.tenantId,
            userId: query.userId,
            actorId: query.actorId,
            email: query.email,
            name: query.name,
            username: query.username,
            user
          })
        ]);

        const activeOrganizations = organizations.filter((organization) => organization.isActive);
        const currentOrganizationId =
          activeOrganizations.find((organization) => organization.organizationId === query.tenantId)
            ?.organizationId ??
          activeOrganizations.find((organization) => organization.isDefault)?.organizationId ??
          activeOrganizations[0]?.organizationId ??
          null;

        const currentOrganization =
          activeOrganizations.find(
            (organization) => organization.organizationId === currentOrganizationId
          ) ?? null;

        const currentOrganizationSettings = await this.userOrganizationSettingsRepository.getMany({
          organizationId: Number(currentOrganizationId ?? query.tenantId),
          userId: userIdNum
        });
        const resolvedTenantName = currentOrganization?.name ?? resolvedOrganization?.name ?? null;
        const resolvedTenantDisplayName =
          currentOrganization?.displayName ??
          currentOrganization?.name ??
          resolvedOrganization?.displayName ??
          resolvedOrganization?.name ??
          null;
        const resolvedTenantSlug = currentOrganization?.slug ?? resolvedOrganization?.slug ?? null;

        return {
          user: {
            ...profile,
            tenantId: currentOrganizationId ?? profile.tenantId
          },
          organizations: activeOrganizations,
          currentOrganizationId,
          currentUserSettings: buildCurrentUserSettings(
            Object.fromEntries(
              currentOrganizationSettings.map((setting) => [setting.settingKey, setting.valueJson])
            )
          ),
          tenantName: resolvedTenantName,
          tenantDisplayName: resolvedTenantDisplayName,
          tenantSlug: resolvedTenantSlug
        };
      }
    );
  }
}

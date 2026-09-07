import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { CurrentUserSettingsResponseDto } from '../../dto/current-user-settings.dto';
import { GetCurrentUserSettingsQuery } from '../../queries/get-current-user-settings.query';
import { UserOrganizationSettingsRepository } from '../../repositories/user-organization-settings.repository';
import { buildCurrentUserSettings } from '../../user-settings.constants';

@QueryHandler(GetCurrentUserSettingsQuery)
export class GetCurrentUserSettingsHandler implements IQueryHandler<GetCurrentUserSettingsQuery> {
  constructor(
    private readonly userOrganizationSettingsRepository: UserOrganizationSettingsRepository
  ) {}

  async execute(query: GetCurrentUserSettingsQuery): Promise<CurrentUserSettingsResponseDto> {
    const organizationId = Number(query.tenantId);
    const userId = Number(query.userId);

    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'tenantId',
        expectedType: 'positive integer'
      });
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive integer'
      });
    }

    const storedSettings = await this.userOrganizationSettingsRepository.getMany({
      organizationId,
      userId
    });

    return buildCurrentUserSettings(
      Object.fromEntries(storedSettings.map((setting) => [setting.settingKey, setting.valueJson]))
    );
  }
}

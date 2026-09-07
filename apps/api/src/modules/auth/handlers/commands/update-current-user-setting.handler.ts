import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { UpdateCurrentUserSettingCommand } from '../../commands/update-current-user-setting.command';
import { CurrentUserSettingsResponseDto } from '../../dto/current-user-settings.dto';
import { UserOrganizationSettingsRepository } from '../../repositories/user-organization-settings.repository';
import {
  CURRENT_USER_SETTING_KEYS,
  buildCurrentUserSettings,
  parseCurrentUserSettingValue
} from '../../user-settings.constants';

@CommandHandler(UpdateCurrentUserSettingCommand)
export class UpdateCurrentUserSettingHandler implements ICommandHandler<UpdateCurrentUserSettingCommand> {
  constructor(
    private readonly userOrganizationSettingsRepository: UserOrganizationSettingsRepository
  ) {}

  async execute(command: UpdateCurrentUserSettingCommand): Promise<CurrentUserSettingsResponseDto> {
    const organizationId = Number(command.tenantId);
    const userId = Number(command.userId);

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

    const value = parseCurrentUserSettingValue(command.settingKey, command.value);

    if (
      command.settingKey === CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID &&
      value === null
    ) {
      await this.userOrganizationSettingsRepository.deleteByKey({
        organizationId,
        userId,
        settingKey: command.settingKey
      });
    } else {
      await this.userOrganizationSettingsRepository.upsertSetting({
        organizationId,
        userId,
        settingKey: command.settingKey,
        valueJson: value
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

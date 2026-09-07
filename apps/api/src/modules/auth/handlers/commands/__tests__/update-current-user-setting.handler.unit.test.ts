import { Test } from '@nestjs/testing';

import { UpdateCurrentUserSettingCommand } from '../../../commands/update-current-user-setting.command';
import { UserOrganizationSettingsRepository } from '../../../repositories/user-organization-settings.repository';
import { CURRENT_USER_SETTING_KEYS } from '../../../user-settings.constants';
import { UpdateCurrentUserSettingHandler } from '../update-current-user-setting.handler';

import type { TestingModule } from '@nestjs/testing';

describe('UpdateCurrentUserSettingHandler', () => {
  let handler: UpdateCurrentUserSettingHandler;
  let userOrganizationSettingsRepository: jest.Mocked<UserOrganizationSettingsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateCurrentUserSettingHandler,
        {
          provide: UserOrganizationSettingsRepository,
          useValue: {
            upsertSetting: jest.fn(),
            deleteByKey: jest.fn(),
            getMany: jest.fn()
          }
        }
      ]
    }).compile();

    handler = module.get(UpdateCurrentUserSettingHandler);
    userOrganizationSettingsRepository = module.get(UserOrganizationSettingsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deletes the active project setting row when clearing project context', async () => {
    userOrganizationSettingsRepository.getMany.mockResolvedValue([]);

    const command = new UpdateCurrentUserSettingCommand({
      tenantId: '12',
      userId: '34',
      actorId: '34',
      settingKey: CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID,
      value: null
    });

    const result = await handler.execute(command);

    expect(userOrganizationSettingsRepository.deleteByKey).toHaveBeenCalledWith({
      organizationId: 12,
      userId: 34,
      settingKey: CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID
    });
    expect(userOrganizationSettingsRepository.upsertSetting).not.toHaveBeenCalled();
    expect(result.workspaceActiveProjectId).toBeNull();
  });

  it('upserts non-null setting payloads normally', async () => {
    userOrganizationSettingsRepository.getMany.mockResolvedValue([
      {
        settingKey: CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID,
        valueJson: 42
      }
    ]);

    const command = new UpdateCurrentUserSettingCommand({
      tenantId: '12',
      userId: '34',
      actorId: '34',
      settingKey: CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID,
      value: 42
    });

    const result = await handler.execute(command);

    expect(userOrganizationSettingsRepository.upsertSetting).toHaveBeenCalledWith({
      organizationId: 12,
      userId: 34,
      settingKey: CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID,
      valueJson: 42
    });
    expect(userOrganizationSettingsRepository.deleteByKey).not.toHaveBeenCalled();
    expect(result.workspaceActiveProjectId).toBe(42);
  });
});

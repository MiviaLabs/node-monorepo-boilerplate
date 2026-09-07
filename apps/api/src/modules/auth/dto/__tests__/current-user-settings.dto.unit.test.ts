import { validate } from 'class-validator';

import {
  CurrentUserSettingKeyParamDto,
  UpdateCurrentUserSettingDto
} from '../current-user-settings.dto';

describe('CurrentUserSettings DTOs', () => {
  it('requires a setting value in update payloads', async () => {
    const dto = new UpdateCurrentUserSettingDto();

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('value');
    expect(errors[0]?.constraints).toMatchObject({
      isDefined: expect.any(String)
    });
  });

  it('accepts a present setting value', async () => {
    const dto = new UpdateCurrentUserSettingDto();
    dto.value = ['yourWork', 'content', 'project', 'organization'];

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts null as a present setting value', async () => {
    const dto = new UpdateCurrentUserSettingDto();
    dto.value = null;

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('validates supported setting keys', async () => {
    const dto = new CurrentUserSettingKeyParamDto();
    dto.settingKey = 'sidebar.section_order';

    const validErrors = await validate(dto);
    expect(validErrors).toHaveLength(0);

    dto.settingKey = 'invalid.key' as never;
    const invalidErrors = await validate(dto);
    expect(invalidErrors).toHaveLength(1);
    expect(invalidErrors[0]?.property).toBe('settingKey');
  });

  it('accepts the workspace active project setting key', async () => {
    const dto = new CurrentUserSettingKeyParamDto();
    dto.settingKey = 'workspace.active_project_id';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});

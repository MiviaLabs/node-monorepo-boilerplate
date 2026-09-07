import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  inArray,
  userOrganizationSettings,
  type NewUserOrganizationSetting,
  type NodePgDatabase,
  type UserOrganizationSettingValue
} from '@package/db-core';

import { MAIN_DB } from '../../../common/database/database.constants';

import type { CurrentUserSettingKey } from '../user-settings.constants';

interface FindSettingParams {
  organizationId: number;
  userId: number;
  settingKey: CurrentUserSettingKey;
}

interface GetManySettingsParams {
  organizationId: number;
  userId: number;
  settingKeys?: CurrentUserSettingKey[];
}

interface UpsertSettingParams {
  organizationId: number;
  userId: number;
  settingKey: CurrentUserSettingKey;
  valueJson: UserOrganizationSettingValue;
}

interface StoredUserOrganizationSetting {
  settingKey: CurrentUserSettingKey;
  valueJson: UserOrganizationSettingValue;
}

@Injectable()
export class UserOrganizationSettingsRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async findByKey(params: FindSettingParams): Promise<UserOrganizationSettingValue | null> {
    const { organizationId, userId, settingKey } = params;
    const [setting] = await this.db
      .select({ valueJson: userOrganizationSettings.valueJson })
      .from(userOrganizationSettings)
      .where(
        and(
          eq(userOrganizationSettings.organizationId, organizationId),
          eq(userOrganizationSettings.userId, userId),
          eq(userOrganizationSettings.settingKey, settingKey)
        )
      )
      .limit(1);

    return setting?.valueJson ?? null;
  }

  async getMany(params: GetManySettingsParams): Promise<StoredUserOrganizationSetting[]> {
    const { organizationId, userId, settingKeys } = params;
    const filters = [
      eq(userOrganizationSettings.organizationId, organizationId),
      eq(userOrganizationSettings.userId, userId)
    ];

    if (settingKeys && settingKeys.length > 0) {
      filters.push(
        inArray(
          userOrganizationSettings.settingKey,
          settingKeys as [CurrentUserSettingKey, ...CurrentUserSettingKey[]]
        )
      );
    }

    const settings = await this.db
      .select({
        settingKey: userOrganizationSettings.settingKey,
        valueJson: userOrganizationSettings.valueJson
      })
      .from(userOrganizationSettings)
      .where(and(...filters));

    return settings as StoredUserOrganizationSetting[];
  }

  async upsertSetting(params: UpsertSettingParams): Promise<void> {
    const { organizationId, userId, settingKey, valueJson } = params;
    const now = new Date();
    const values: NewUserOrganizationSetting = {
      organizationId,
      userId,
      settingKey,
      valueJson,
      createdAt: now,
      updatedAt: now
    };

    await this.db
      .insert(userOrganizationSettings)
      .values(values)
      .onConflictDoUpdate({
        target: [
          userOrganizationSettings.userId,
          userOrganizationSettings.organizationId,
          userOrganizationSettings.settingKey
        ],
        set: {
          valueJson,
          updatedAt: now
        }
      });
  }

  async deleteByKey(params: FindSettingParams): Promise<void> {
    const { organizationId, userId, settingKey } = params;

    await this.db
      .delete(userOrganizationSettings)
      .where(
        and(
          eq(userOrganizationSettings.organizationId, organizationId),
          eq(userOrganizationSettings.userId, userId),
          eq(userOrganizationSettings.settingKey, settingKey)
        )
      );
  }
}

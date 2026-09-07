import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsIn, ValidateIf } from 'class-validator';

import {
  CURRENT_USER_SETTING_KEYS,
  DASHBOARD_DEFAULT_VIEW_KEYS,
  DEFAULT_CURRENT_USER_SETTINGS,
  SIDEBAR_SECTION_KEYS,
  type CurrentUserSettingKey,
  type DashboardDefaultViewKey,
  type SidebarSectionKey,
  type WorkspaceActiveProjectId
} from '../user-settings.constants';

export class CurrentUserSettingsResponseDto {
  @ApiProperty({
    description:
      'Ordered dashboard sidebar sections for the current user in the current workspace.',
    enum: SIDEBAR_SECTION_KEYS,
    isArray: true,
    example: DEFAULT_CURRENT_USER_SETTINGS.sidebarSectionOrder
  })
  sidebarSectionOrder!: SidebarSectionKey[];

  @ApiProperty({
    description: 'Preferred landing page when opening the dashboard entry route.',
    enum: DASHBOARD_DEFAULT_VIEW_KEYS,
    example: DEFAULT_CURRENT_USER_SETTINGS.dashboardDefaultView
  })
  dashboardDefaultView!: DashboardDefaultViewKey;

  @ApiProperty({
    description:
      'Active project context for the current user in the current workspace organization.',
    example: 42,
    nullable: true,
    oneOf: [{ type: 'integer' }, { type: 'null' }]
  })
  workspaceActiveProjectId!: WorkspaceActiveProjectId;
}

export class CurrentUserSettingKeyParamDto {
  @ApiProperty({
    description: 'Supported current-user workspace setting key.',
    enum: Object.values(CURRENT_USER_SETTING_KEYS),
    example: CURRENT_USER_SETTING_KEYS.SIDEBAR_SECTION_ORDER
  })
  @IsIn(Object.values(CURRENT_USER_SETTING_KEYS))
  settingKey!: CurrentUserSettingKey;
}

export class UpdateCurrentUserSettingDto {
  @ApiProperty({
    description: 'Typed setting payload. Format depends on the setting key.',
    examples: {
      sidebarSectionOrder: { value: ['yourWork', 'content', 'project', 'organization'] },
      dashboardDefaultView: { value: 'projects' },
      workspaceActiveProjectId: { value: 42 },
      clearedWorkspaceActiveProjectId: { value: null }
    }
  })
  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  value!: unknown;
}

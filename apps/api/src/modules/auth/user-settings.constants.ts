import { Errors } from '@package/errors';

export const CURRENT_USER_SETTING_KEYS = {
  SIDEBAR_SECTION_ORDER: 'sidebar.section_order',
  DASHBOARD_DEFAULT_VIEW: 'dashboard.default_view',
  WORKSPACE_ACTIVE_PROJECT_ID: 'workspace.active_project_id'
} as const;

export type CurrentUserSettingKey =
  (typeof CURRENT_USER_SETTING_KEYS)[keyof typeof CURRENT_USER_SETTING_KEYS];

export const SIDEBAR_SECTION_KEYS = ['yourWork', 'content', 'project', 'organization'] as const;
export const DASHBOARD_DEFAULT_VIEW_KEYS = [
  'dashboard',
  'projects',
  'members',
  'profile',
  'accountSettings',
  'organizationSettings'
] as const;

export type SidebarSectionKey = (typeof SIDEBAR_SECTION_KEYS)[number];
export type DashboardDefaultViewKey = (typeof DASHBOARD_DEFAULT_VIEW_KEYS)[number];
export type WorkspaceActiveProjectId = number | null;

export interface CurrentUserSettings {
  sidebarSectionOrder: SidebarSectionKey[];
  dashboardDefaultView: DashboardDefaultViewKey;
  workspaceActiveProjectId: WorkspaceActiveProjectId;
}

type CurrentUserSettingValueMap = {
  [CURRENT_USER_SETTING_KEYS.SIDEBAR_SECTION_ORDER]: SidebarSectionKey[];
  [CURRENT_USER_SETTING_KEYS.DASHBOARD_DEFAULT_VIEW]: DashboardDefaultViewKey;
  [CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID]: WorkspaceActiveProjectId;
};

interface CurrentUserSettingDefinition<K extends CurrentUserSettingKey> {
  defaultValue: CurrentUserSettingValueMap[K];
  read: (value: unknown) => CurrentUserSettingValueMap[K];
  parse: (value: unknown) => CurrentUserSettingValueMap[K];
}

export const DEFAULT_SIDEBAR_SECTION_ORDER: SidebarSectionKey[] = [
  'yourWork',
  'content',
  'project',
  'organization'
];
export const DEFAULT_DASHBOARD_DEFAULT_VIEW: DashboardDefaultViewKey = 'dashboard';
export const DEFAULT_CURRENT_USER_SETTINGS: CurrentUserSettings = {
  sidebarSectionOrder: [...DEFAULT_SIDEBAR_SECTION_ORDER],
  dashboardDefaultView: DEFAULT_DASHBOARD_DEFAULT_VIEW,
  workspaceActiveProjectId: null
};

export function isSidebarSectionKey(value: unknown): value is SidebarSectionKey {
  return typeof value === 'string' && SIDEBAR_SECTION_KEYS.includes(value as SidebarSectionKey);
}

export function isDashboardDefaultViewKey(value: unknown): value is DashboardDefaultViewKey {
  return (
    typeof value === 'string' &&
    DASHBOARD_DEFAULT_VIEW_KEYS.includes(value as DashboardDefaultViewKey)
  );
}

export function normalizeSidebarSectionOrder(value: unknown): SidebarSectionKey[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SIDEBAR_SECTION_ORDER];
  }

  const seen = new Set<SidebarSectionKey>();
  const normalized: SidebarSectionKey[] = [];
  let hasExplicitContent = false;

  for (const entry of value) {
    if (!isSidebarSectionKey(entry) || seen.has(entry)) {
      continue;
    }

    seen.add(entry);

    if (entry === 'content') {
      hasExplicitContent = true;
    }

    normalized.push(entry);
  }

  for (const sectionKey of DEFAULT_SIDEBAR_SECTION_ORDER) {
    if (sectionKey === 'content' || seen.has(sectionKey)) {
      continue;
    }

    normalized.push(sectionKey as SidebarSectionKey);
  }

  if (hasExplicitContent) {
    return normalized;
  }

  const yourWorkIndex = normalized.indexOf('yourWork');

  if (yourWorkIndex === -1) {
    return ['content', ...normalized];
  }

  const withContent = [...normalized];
  withContent.splice(yourWorkIndex + 1, 0, 'content');
  return withContent;
}

export function normalizeDashboardDefaultView(value: unknown): DashboardDefaultViewKey {
  return isDashboardDefaultViewKey(value) ? value : DEFAULT_DASHBOARD_DEFAULT_VIEW;
}

export function normalizeWorkspaceActiveProjectId(value: unknown): WorkspaceActiveProjectId {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function parseSidebarSectionOrder(value: unknown): SidebarSectionKey[] {
  if (!Array.isArray(value)) {
    throw Errors.validationinvalidValueFor002({
      field: CURRENT_USER_SETTING_KEYS.SIDEBAR_SECTION_ORDER,
      expectedType: 'full sidebar section order array'
    });
  }

  if (value.length !== SIDEBAR_SECTION_KEYS.length) {
    throw Errors.validationinvalidValueFor002({
      field: CURRENT_USER_SETTING_KEYS.SIDEBAR_SECTION_ORDER,
      expectedType: `array with ${SIDEBAR_SECTION_KEYS.length} unique section ids`
    });
  }

  const seen = new Set<SidebarSectionKey>();

  for (const entry of value) {
    if (!isSidebarSectionKey(entry) || seen.has(entry)) {
      throw Errors.validationinvalidValueFor002({
        field: CURRENT_USER_SETTING_KEYS.SIDEBAR_SECTION_ORDER,
        expectedType: `array containing each of ${SIDEBAR_SECTION_KEYS.join(', ')} exactly once`
      });
    }

    seen.add(entry);
  }

  return value.map((entry) => entry as SidebarSectionKey);
}

function parseDashboardDefaultView(value: unknown): DashboardDefaultViewKey {
  if (!isDashboardDefaultViewKey(value)) {
    throw Errors.validationinvalidValueFor002({
      field: CURRENT_USER_SETTING_KEYS.DASHBOARD_DEFAULT_VIEW,
      expectedType: `one of ${DASHBOARD_DEFAULT_VIEW_KEYS.join(', ')}`
    });
  }

  return value;
}

function parseWorkspaceActiveProjectId(value: unknown): WorkspaceActiveProjectId {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw Errors.validationinvalidValueFor002({
      field: CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID,
      expectedType: 'positive integer project id or null'
    });
  }

  return value;
}

const CURRENT_USER_SETTING_DEFINITIONS: {
  [K in CurrentUserSettingKey]: CurrentUserSettingDefinition<K>;
} = {
  [CURRENT_USER_SETTING_KEYS.SIDEBAR_SECTION_ORDER]: {
    defaultValue: [...DEFAULT_SIDEBAR_SECTION_ORDER],
    read: normalizeSidebarSectionOrder,
    parse: parseSidebarSectionOrder
  },
  [CURRENT_USER_SETTING_KEYS.DASHBOARD_DEFAULT_VIEW]: {
    defaultValue: DEFAULT_DASHBOARD_DEFAULT_VIEW,
    read: normalizeDashboardDefaultView,
    parse: parseDashboardDefaultView
  },
  [CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID]: {
    defaultValue: null,
    read: normalizeWorkspaceActiveProjectId,
    parse: parseWorkspaceActiveProjectId
  }
};

export function isCurrentUserSettingKey(value: unknown): value is CurrentUserSettingKey {
  return (
    typeof value === 'string' &&
    Object.values(CURRENT_USER_SETTING_KEYS).includes(value as CurrentUserSettingKey)
  );
}

export function readCurrentUserSettingValue<K extends CurrentUserSettingKey>(
  settingKey: K,
  value: unknown
): CurrentUserSettingValueMap[K] {
  return CURRENT_USER_SETTING_DEFINITIONS[settingKey].read(value);
}

export function parseCurrentUserSettingValue<K extends CurrentUserSettingKey>(
  settingKey: K,
  value: unknown
): CurrentUserSettingValueMap[K] {
  return CURRENT_USER_SETTING_DEFINITIONS[settingKey].parse(value);
}

export function buildCurrentUserSettings(
  values: Partial<Record<CurrentUserSettingKey, unknown>>
): CurrentUserSettings {
  return {
    sidebarSectionOrder: readCurrentUserSettingValue(
      CURRENT_USER_SETTING_KEYS.SIDEBAR_SECTION_ORDER,
      values[CURRENT_USER_SETTING_KEYS.SIDEBAR_SECTION_ORDER]
    ),
    dashboardDefaultView: readCurrentUserSettingValue(
      CURRENT_USER_SETTING_KEYS.DASHBOARD_DEFAULT_VIEW,
      values[CURRENT_USER_SETTING_KEYS.DASHBOARD_DEFAULT_VIEW]
    ),
    workspaceActiveProjectId: readCurrentUserSettingValue(
      CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID,
      values[CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID]
    )
  };
}

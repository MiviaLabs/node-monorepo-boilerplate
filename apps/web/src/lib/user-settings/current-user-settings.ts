export const USER_SETTING_KEYS = {
  SIDEBAR_SECTION_ORDER: 'sidebar.section_order',
  DASHBOARD_DEFAULT_VIEW: 'dashboard.default_view',
  WORKSPACE_ACTIVE_PROJECT_ID: 'workspace.active_project_id'
} as const;

export const SIDEBAR_SECTION_ORDER = ['yourWork', 'content', 'project', 'organization'] as const;
export const DASHBOARD_DEFAULT_VIEWS = [
  'dashboard',
  'projects',
  'members',
  'profile',
  'accountSettings',
  'organizationSettings'
] as const;

export type CurrentUserSettingKey = (typeof USER_SETTING_KEYS)[keyof typeof USER_SETTING_KEYS];
export type SidebarSectionKey = (typeof SIDEBAR_SECTION_ORDER)[number];
export type DashboardDefaultViewKey = (typeof DASHBOARD_DEFAULT_VIEWS)[number];
export type WorkspaceActiveProjectId = number | null;

export interface CurrentUserSettings {
  sidebarSectionOrder: SidebarSectionKey[];
  dashboardDefaultView: DashboardDefaultViewKey;
  workspaceActiveProjectId: WorkspaceActiveProjectId;
}

export const DEFAULT_CURRENT_USER_SETTINGS: CurrentUserSettings = {
  sidebarSectionOrder: ['yourWork', 'content', 'project', 'organization'],
  dashboardDefaultView: 'dashboard',
  workspaceActiveProjectId: null
};

export function isSidebarSectionKey(value: unknown): value is SidebarSectionKey {
  return typeof value === 'string' && SIDEBAR_SECTION_ORDER.includes(value as SidebarSectionKey);
}

export function isDashboardDefaultViewKey(value: unknown): value is DashboardDefaultViewKey {
  return (
    typeof value === 'string' && DASHBOARD_DEFAULT_VIEWS.includes(value as DashboardDefaultViewKey)
  );
}

export function normalizeSidebarSectionOrder(value: unknown): SidebarSectionKey[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_CURRENT_USER_SETTINGS.sidebarSectionOrder];
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

  for (const sectionKey of DEFAULT_CURRENT_USER_SETTINGS.sidebarSectionOrder) {
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
  return isDashboardDefaultViewKey(value)
    ? value
    : DEFAULT_CURRENT_USER_SETTINGS.dashboardDefaultView;
}

export function normalizeWorkspaceActiveProjectId(value: unknown): WorkspaceActiveProjectId {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function normalizeCurrentUserSettings(value: unknown): CurrentUserSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    sidebarSectionOrder: normalizeSidebarSectionOrder(raw.sidebarSectionOrder),
    dashboardDefaultView: normalizeDashboardDefaultView(raw.dashboardDefaultView),
    workspaceActiveProjectId: normalizeWorkspaceActiveProjectId(raw.workspaceActiveProjectId)
  };
}

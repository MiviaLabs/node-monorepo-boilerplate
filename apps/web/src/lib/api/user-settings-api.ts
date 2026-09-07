import {
  USER_SETTING_KEYS,
  normalizeCurrentUserSettings,
  normalizeSidebarSectionOrder,
  type CurrentUserSettingKey,
  type CurrentUserSettings,
  type DashboardDefaultViewKey,
  type SidebarSectionKey,
  type WorkspaceActiveProjectId
} from '~/lib/user-settings/current-user-settings';

function extractApiErrorMessage(payload: unknown, fallbackStatus: number): string {
  if (!payload || typeof payload !== 'object') {
    return `HTTP ${fallbackStatus}`;
  }

  const obj = payload as {
    message?: unknown;
    detail?: unknown;
    error?: unknown;
    data?: unknown;
    metadata?: { error?: { errors?: unknown } };
  };

  if (typeof obj.message === 'string' && obj.message.trim()) {
    return obj.message;
  }

  if (typeof obj.detail === 'string' && obj.detail.trim()) {
    return obj.detail;
  }

  if (typeof obj.error === 'string' && obj.error.trim()) {
    return obj.error;
  }

  if (obj.data && typeof obj.data === 'object') {
    const dataObj = obj.data as { message?: unknown };
    if (typeof dataObj.message === 'string' && dataObj.message.trim()) {
      return dataObj.message;
    }
  }

  const metadataErrors = obj.metadata?.error?.errors;
  if (Array.isArray(metadataErrors)) {
    const text = metadataErrors.find((entry) => typeof entry === 'string' && entry.trim());
    if (typeof text === 'string') {
      return text;
    }
  }

  return `HTTP ${fallbackStatus}`;
}

function buildTenantHeader(tenantId?: string): Record<string, string> {
  const normalizedTenantId = tenantId?.trim();
  return normalizedTenantId ? { 'x-tenant-id': normalizedTenantId } : {};
}

export const userSettingsApi = {
  async getCurrentUserSettings(tenantId?: string): Promise<CurrentUserSettings> {
    const response = await fetch('/api/auth/me/settings', {
      method: 'GET',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(extractApiErrorMessage(error, response.status));
    }

    const json = (await response.json()) as { data?: unknown };
    return normalizeCurrentUserSettings(json.data ?? json);
  },

  async updateCurrentUserSetting(
    settingKey: CurrentUserSettingKey,
    value: unknown,
    tenantId?: string
  ): Promise<CurrentUserSettings> {
    const response = await fetch(`/api/auth/me/settings/${encodeURIComponent(settingKey)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildTenantHeader(tenantId)
      },
      body: JSON.stringify({ value })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(extractApiErrorMessage(error, response.status));
    }

    const json = (await response.json()) as { data?: unknown };
    return normalizeCurrentUserSettings(json.data ?? json);
  },

  async updateSidebarSectionOrder(
    sectionOrder: SidebarSectionKey[],
    tenantId?: string
  ): Promise<CurrentUserSettings> {
    return this.updateCurrentUserSetting(
      USER_SETTING_KEYS.SIDEBAR_SECTION_ORDER,
      [...normalizeSidebarSectionOrder(sectionOrder)],
      tenantId
    );
  },

  async updateDashboardDefaultView(
    dashboardDefaultView: DashboardDefaultViewKey,
    tenantId?: string
  ): Promise<CurrentUserSettings> {
    return this.updateCurrentUserSetting(
      USER_SETTING_KEYS.DASHBOARD_DEFAULT_VIEW,
      dashboardDefaultView,
      tenantId
    );
  },

  async updateWorkspaceActiveProjectId(
    workspaceActiveProjectId: WorkspaceActiveProjectId,
    tenantId?: string
  ): Promise<CurrentUserSettings> {
    return this.updateCurrentUserSetting(
      USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID,
      workspaceActiveProjectId,
      tenantId
    );
  }
};

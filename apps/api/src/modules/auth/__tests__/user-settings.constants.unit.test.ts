import {
  CURRENT_USER_SETTING_KEYS,
  DEFAULT_CURRENT_USER_SETTINGS,
  DEFAULT_SIDEBAR_SECTION_ORDER,
  buildCurrentUserSettings,
  normalizeDashboardDefaultView,
  normalizeSidebarSectionOrder,
  normalizeWorkspaceActiveProjectId,
  parseCurrentUserSettingValue
} from '../user-settings.constants';

describe('user settings constants', () => {
  describe('normalizeSidebarSectionOrder', () => {
    it('returns default order when value is not an array', () => {
      expect(normalizeSidebarSectionOrder(undefined)).toEqual(DEFAULT_SIDEBAR_SECTION_ORDER);
    });

    it('removes invalid and duplicate entries while preserving known sections', () => {
      expect(
        normalizeSidebarSectionOrder(['organization', 'organization', 'invalid', 'yourWork'])
      ).toEqual(['organization', 'yourWork', 'content', 'project']);
    });

    it('appends missing sections in default order', () => {
      expect(normalizeSidebarSectionOrder(['organization'])).toEqual([
        'organization',
        'yourWork',
        'content',
        'project'
      ]);
    });

    it('inserts content second for older saved orders that do not include it yet', () => {
      expect(normalizeSidebarSectionOrder(['yourWork', 'project', 'organization'])).toEqual([
        'yourWork',
        'content',
        'project',
        'organization'
      ]);
    });

    it('preserves explicit content placement in saved orders', () => {
      expect(
        normalizeSidebarSectionOrder(['organization', 'content', 'yourWork', 'project'])
      ).toEqual(['organization', 'content', 'yourWork', 'project']);
    });
  });

  describe('normalizeDashboardDefaultView', () => {
    it('returns dashboard when value is invalid', () => {
      expect(normalizeDashboardDefaultView('invalid')).toBe('dashboard');
    });

    it('returns the stored value when valid', () => {
      expect(normalizeDashboardDefaultView('projects')).toBe('projects');
    });
  });

  describe('normalizeWorkspaceActiveProjectId', () => {
    it('returns null for invalid values', () => {
      expect(normalizeWorkspaceActiveProjectId(undefined)).toBeNull();
      expect(normalizeWorkspaceActiveProjectId('42')).toBeNull();
      expect(normalizeWorkspaceActiveProjectId(0)).toBeNull();
      expect(normalizeWorkspaceActiveProjectId(-1)).toBeNull();
    });

    it('returns the stored value when valid', () => {
      expect(normalizeWorkspaceActiveProjectId(42)).toBe(42);
    });
  });

  describe('parseCurrentUserSettingValue', () => {
    it('rejects duplicate sidebar section ids', () => {
      expect(() =>
        parseCurrentUserSettingValue(CURRENT_USER_SETTING_KEYS.SIDEBAR_SECTION_ORDER, [
          'organization',
          'organization',
          'project',
          'content'
        ])
      ).toThrow();
    });

    it('parses dashboard default view values strictly', () => {
      expect(
        parseCurrentUserSettingValue(CURRENT_USER_SETTING_KEYS.DASHBOARD_DEFAULT_VIEW, 'projects')
      ).toBe('projects');
      expect(() =>
        parseCurrentUserSettingValue(CURRENT_USER_SETTING_KEYS.DASHBOARD_DEFAULT_VIEW, 'invalid')
      ).toThrow();
    });

    it('parses workspace active project id values strictly', () => {
      expect(
        parseCurrentUserSettingValue(CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID, 42)
      ).toBe(42);
      expect(
        parseCurrentUserSettingValue(CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID, null)
      ).toBeNull();
      expect(() =>
        parseCurrentUserSettingValue(CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID, '42')
      ).toThrow();
      expect(() =>
        parseCurrentUserSettingValue(CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID, 0)
      ).toThrow();
    });
  });

  describe('buildCurrentUserSettings', () => {
    it('fills defaults for missing settings', () => {
      expect(buildCurrentUserSettings({})).toEqual(DEFAULT_CURRENT_USER_SETTINGS);
    });

    it('reads workspace active project id from stored values', () => {
      expect(
        buildCurrentUserSettings({
          [CURRENT_USER_SETTING_KEYS.WORKSPACE_ACTIVE_PROJECT_ID]: 42
        })
      ).toEqual({
        ...DEFAULT_CURRENT_USER_SETTINGS,
        workspaceActiveProjectId: 42
      });
    });
  });
});

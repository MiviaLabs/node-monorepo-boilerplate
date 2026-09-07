import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CURRENT_USER_SETTINGS,
  SIDEBAR_SECTION_ORDER,
  normalizeCurrentUserSettings,
  normalizeSidebarSectionOrder,
  normalizeWorkspaceActiveProjectId
} from './current-user-settings';

describe('sidebar-section-order', () => {
  it('returns default order for invalid values', () => {
    expect(normalizeSidebarSectionOrder(null)).toEqual(SIDEBAR_SECTION_ORDER);
  });

  it('deduplicates entries and filters unknown keys', () => {
    expect(
      normalizeSidebarSectionOrder(['organization', 'organization', 'unknown', 'yourWork'])
    ).toEqual(['organization', 'yourWork', 'content', 'project']);
  });

  it('inserts content second for older saved orders that do not include it yet', () => {
    expect(normalizeSidebarSectionOrder(['yourWork', 'project', 'organization'])).toEqual([
      'yourWork',
      'content',
      'project',
      'organization'
    ]);
  });

  it('preserves an explicit content position once it exists in the saved order', () => {
    expect(
      normalizeSidebarSectionOrder(['organization', 'content', 'yourWork', 'project'])
    ).toEqual(['organization', 'content', 'yourWork', 'project']);
  });

  it('appends missing keys in default order', () => {
    expect(normalizeSidebarSectionOrder(['organization'])).toEqual([
      'organization',
      'yourWork',
      'content',
      'project'
    ]);
  });

  it('normalizes the full settings payload with defaults', () => {
    expect(
      normalizeCurrentUserSettings({
        sidebarSectionOrder: ['organization'],
        dashboardDefaultView: 'invalid',
        workspaceActiveProjectId: 'invalid'
      })
    ).toEqual({
      sidebarSectionOrder: ['organization', 'yourWork', 'content', 'project'],
      dashboardDefaultView: DEFAULT_CURRENT_USER_SETTINGS.dashboardDefaultView,
      workspaceActiveProjectId: DEFAULT_CURRENT_USER_SETTINGS.workspaceActiveProjectId
    });
  });

  it('normalizes the workspace active project id to a positive integer or null', () => {
    expect(normalizeWorkspaceActiveProjectId(42)).toBe(42);
    expect(normalizeWorkspaceActiveProjectId(0)).toBeNull();
    expect(normalizeWorkspaceActiveProjectId(-1)).toBeNull();
    expect(normalizeWorkspaceActiveProjectId('42')).toBeNull();
    expect(normalizeWorkspaceActiveProjectId(null)).toBeNull();
  });
});

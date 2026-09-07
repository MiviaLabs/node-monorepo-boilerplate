import { describe, expect, it } from 'vitest';

import { getMainSidebarItems, getProjectSidebarItems } from './menu-items';

describe('flexy menu items', () => {
  it('keeps only the issues link in the project section sidebar items as a canonical workspace route', () => {
    expect(getProjectSidebarItems('42')).toEqual([
      expect.objectContaining({
        href: '/issues?projectId=42',
        label: 'Issues'
      })
    ]);
  });

  it('adds issues to the general section as a top-level route', () => {
    expect(getMainSidebarItems()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: '/issues',
          label: 'Issues'
        })
      ])
    );
  });
});

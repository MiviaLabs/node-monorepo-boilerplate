import { describe, expect, it } from 'vitest';

import {
  buildOrganizationContentPages,
  contentEntriesToOrganizationPages
} from './content-entry-adapter';

describe('contentEntryToPage', () => {
  it('maps updater identity into the content page view model', () => {
    const [page] = contentEntriesToOrganizationPages([
      {
        id: 11,
        organizationId: 12,
        projectId: null,
        parentId: null,
        title: 'Home',
        slug: 'home',
        revision: '2026-03-28T10:00:00.000Z',
        contentMarkdown: '# Home',
        position: 0,
        createdBy: 44,
        updatedBy: 44,
        updatedByDisplayName: 'Jordan Lee',
        updatedByPhotoUrl: 'https://signed.example.test/avatar.png',
        createdAt: '2026-03-28T09:00:00.000Z',
        updatedAt: '2026-03-28T10:00:00.000Z'
      }
    ]);

    expect(page).toBeDefined();
    expect(page?.updatedByLabel).toBe('Jordan Lee');
    expect(page?.updatedByPhotoUrl).toBe('https://signed.example.test/avatar.png');
    expect(page?.versions[0]?.author).toBe('Jordan Lee');
  });

  it('falls back to a stable user label when display name is missing', () => {
    const [page] = contentEntriesToOrganizationPages([
      {
        id: 11,
        organizationId: 12,
        projectId: null,
        parentId: null,
        title: 'Home',
        slug: 'home',
        revision: '2026-03-28T10:00:00.000Z',
        contentMarkdown: '# Home',
        position: 0,
        createdBy: 44,
        updatedBy: 44,
        updatedByDisplayName: null,
        updatedByPhotoUrl: null,
        createdAt: '2026-03-28T09:00:00.000Z',
        updatedAt: '2026-03-28T10:00:00.000Z'
      }
    ]);

    expect(page).toBeDefined();
    expect(page?.updatedByLabel).toBe('User 44');
    expect(page?.updatedByPhotoUrl).toBeNull();
    expect(page?.versions[0]?.author).toBe('User 44');
  });

  it('replaces the selected sidebar shell with the full selected entry payload', () => {
    const [page] = buildOrganizationContentPages(
      [
        {
          id: 11,
          organizationId: 12,
          projectId: null,
          parentId: null,
          title: 'Home',
          slug: 'home',
          position: 0,
          updatedBy: 44,
          updatedByDisplayName: 'Jordan Lee',
          updatedByPhotoUrl: null,
          updatedAt: '2026-03-28T10:00:00.000Z'
        }
      ],
      {
        id: 11,
        organizationId: 12,
        projectId: null,
        parentId: null,
        title: 'Home',
        slug: 'home',
        revision: '2026-03-28T10:00:00.000Z',
        contentMarkdown: '# Home',
        position: 0,
        createdBy: 44,
        updatedBy: 44,
        updatedByDisplayName: 'Jordan Lee',
        updatedByPhotoUrl: null,
        createdAt: '2026-03-28T09:00:00.000Z',
        updatedAt: '2026-03-28T10:00:00.000Z'
      }
    );

    expect(page).toBeDefined();
    expect(page?.description).toBe('Home');
    expect(page?.versions[0]?.content).toBe('# Home');
  });
});

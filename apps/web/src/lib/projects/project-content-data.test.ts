import { describe, expect, it } from 'vitest';

import {
  getProjectContentPageBySlug,
  getProjectContentPages,
  searchProjectContentPages
} from './project-content-data';
import { PROJECT_VISIBILITY, type Project } from '../../types/project.types';

const project: Project = {
  id: '17',
  organizationId: 'org-1',
  key: 'NST',
  name: 'Northstar',
  createdAt: '2026-03-20T10:00:00.000Z',
  updatedAt: '2026-03-20T10:00:00.000Z',
  createdBy: 'user-1',
  visibility: PROJECT_VISIBILITY.PRIVATE
};

const members = [
  {
    userId: 'user-1',
    displayName: 'Alice Hart',
    isCreator: true,
    photoUrl: null,
    assignedAt: '2026-03-20T10:00:00.000Z'
  },
  {
    userId: 'user-2',
    displayName: 'Rae Quinn',
    isCreator: false,
    photoUrl: null,
    assignedAt: '2026-03-20T10:00:00.000Z'
  }
];

describe('project content mock data', () => {
  it('builds stable pages with current versions and slugs', () => {
    const pages = getProjectContentPages(project, members);

    expect(pages).toHaveLength(3);
    expect(pages[0]?.slug).toBe('workspace-brief');
    expect(pages.every((page) => page.versions.some((version) => version.isCurrent))).toBe(true);
  });

  it('can resolve a page by slug and search across content', () => {
    const pages = getProjectContentPages(project, members);

    expect(getProjectContentPageBySlug(pages, 'decision-log')?.id).toBe('decisions');

    const results = searchProjectContentPages(pages, 'routed content page tree');

    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('decision-log');
  });
});

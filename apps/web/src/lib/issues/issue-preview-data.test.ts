import { describe, expect, it } from 'vitest';

import { getProjectIssuesPreview, ProjectIssueStage } from './issue-preview-data';

describe('issue preview data', () => {
  const project = {
    id: '42',
    organizationId: 'org-1',
    createdBy: 'user-1',
    key: 'ATLAS',
    name: 'Atlas',
    visibility: 'private',
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:00:00.000Z'
  } as const;

  const members = [
    {
      userId: 'user-1',
      displayName: 'Ada Lovelace',
      photoUrl: null,
      isCreator: true,
      assignedAt: '2026-03-22T00:00:00.000Z'
    },
    {
      userId: 'user-2',
      displayName: 'Grace Hopper',
      photoUrl: null,
      isCreator: false,
      assignedAt: '2026-03-22T00:00:00.000Z'
    }
  ];

  it('builds stable issue summaries and counts from shared project issue previews', () => {
    const preview = getProjectIssuesPreview(project, members);

    expect(preview.items).toHaveLength(6);
    expect(preview.open).toBe(5);
    expect(preview.inProgress).toBe(2);
    expect(preview.blocked).toBe(1);
    expect(preview.done).toBe(1);
    expect(preview.items[0]).toEqual(
      expect.objectContaining({
        id: '42-issue-1',
        identifier: 'ATLAS-53',
        stage: ProjectIssueStage.IN_PROGRESS,
        title: 'Ship Atlas issue list redesign'
      })
    );
  });
});

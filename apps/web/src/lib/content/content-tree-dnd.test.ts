import { describe, expect, it } from 'vitest';

import {
  flattenVisibleContentTree,
  projectContentTreeMove,
  removeDescendantsOf
} from './content-tree-dnd';

import type { ContentEntry } from '~/types/content.types';

const baseEntry = {
  organizationId: 1,
  projectId: null,
  contentMarkdown: '# Page',
  createdBy: 1,
  updatedBy: 1,
  updatedByDisplayName: 'Jordan Lee',
  updatedByPhotoUrl: null,
  createdAt: '2026-03-21T00:00:00.000Z',
  updatedAt: '2026-03-21T00:00:00.000Z'
} satisfies Omit<ContentEntry, 'id' | 'parentId' | 'position' | 'slug' | 'title'>;

const entries: ContentEntry[] = [
  { ...baseEntry, id: 1, parentId: null, position: 0, slug: 'home', title: 'Home' },
  { ...baseEntry, id: 2, parentId: null, position: 1, slug: 'plans', title: 'Plans' },
  { ...baseEntry, id: 3, parentId: 2, position: 0, slug: 'phase-1', title: 'Phase 1' },
  { ...baseEntry, id: 4, parentId: null, position: 2, slug: 'notes', title: 'Notes' }
];

describe('content-tree-dnd helpers', () => {
  it('flattens only visible entries while preserving depth metadata', () => {
    const flattened = flattenVisibleContentTree(entries, new Set(['2']));

    expect(flattened.map((item) => [item.id, item.depth, item.ancestorIds])).toEqual([
      [1, 0, []],
      [2, 0, []],
      [3, 1, [2]],
      [4, 0, []]
    ]);
  });

  it('removes descendants of the active item while dragging a subtree root', () => {
    const flattened = flattenVisibleContentTree(entries, new Set(['2']));

    expect(removeDescendantsOf(flattened, [2]).map((item) => item.id)).toEqual([1, 2, 4]);
  });

  it('projects horizontal drag movement into a child nesting move', () => {
    const flattened = flattenVisibleContentTree(entries, new Set(['2']));
    const sortableItems = removeDescendantsOf(flattened, [4]);

    expect(
      projectContentTreeMove({
        activeId: 4,
        overId: 3,
        horizontalOffset: 16,
        indentationWidth: 12,
        items: sortableItems
      })
    ).toEqual({
      depth: 1,
      parentId: 2,
      position: 0
    });
  });

  it('projects leftward drag movement into an un-nest move', () => {
    const flattened = flattenVisibleContentTree(entries, new Set(['2']));
    const sortableItems = removeDescendantsOf(flattened, [3]);

    expect(
      projectContentTreeMove({
        activeId: 3,
        overId: 4,
        horizontalOffset: -24,
        indentationWidth: 12,
        items: sortableItems
      })
    ).toEqual({
      depth: 0,
      parentId: null,
      position: 3
    });
  });
});

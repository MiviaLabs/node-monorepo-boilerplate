import { describe, expect, it } from 'vitest';

import { buildContentTree, getContentAncestorIdSet, getContentAncestorPath } from './content-tree';

const entries = [
  { id: 1, parentId: null, slug: 'home', title: 'Home' },
  { id: 2, parentId: 1, slug: 'plans', title: 'Plans' },
  { id: 3, parentId: 2, slug: 'phase-2', title: 'Phase 2' },
  { id: 4, parentId: 1, slug: 'notes', title: 'Notes' }
];

describe('content tree helpers', () => {
  it('builds a nested tree while preserving input order', () => {
    const tree = buildContentTree(entries);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.item.slug).toBe('home');
    expect(tree[0]?.children.map((child) => child.item.slug)).toEqual(['plans', 'notes']);
    expect(tree[0]?.children[0]?.children[0]?.item.slug).toBe('phase-2');
  });

  it('treats items with missing parents as roots instead of dropping them', () => {
    const tree = buildContentTree([
      { id: 10, parentId: 999, slug: 'orphan', title: 'Orphan' },
      { id: 11, parentId: null, slug: 'root', title: 'Root' }
    ]);

    expect(tree.map((node) => node.item.slug)).toEqual(['orphan', 'root']);
  });

  it('derives the ancestor path for the selected page slug', () => {
    const path = getContentAncestorPath(entries, 'phase-2');

    expect(path.map((entry) => entry.slug)).toEqual(['home', 'plans', 'phase-2']);
  });

  it('returns an empty ancestor path when the selected slug is unknown', () => {
    expect(getContentAncestorPath(entries, 'missing-slug')).toEqual([]);
  });

  it('returns the active ancestor ids needed to keep the current tree path expanded', () => {
    const ancestorIds = getContentAncestorIdSet(entries, 'phase-2');

    expect(Array.from(ancestorIds)).toEqual(['1', '2', '3']);
  });
});

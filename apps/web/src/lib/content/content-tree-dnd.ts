import { arrayMove } from '@dnd-kit/sortable';

import { buildContentTree, type ContentTreeNode } from './content-tree';

import type { ContentEntry } from '~/types/content.types';

export interface FlattenedContentTreeItem extends ContentEntry {
  ancestorIds: number[];
  depth: number;
  hasChildren: boolean;
}

function flattenVisibleNodes(
  nodes: ContentTreeNode<ContentEntry>[],
  expandedIds: Set<string>,
  depth: number,
  ancestorIds: number[],
  result: FlattenedContentTreeItem[]
): void {
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const nextAncestorIds = [...ancestorIds, node.item.id];

    result.push({
      ...node.item,
      ancestorIds,
      depth,
      hasChildren
    });

    if (!hasChildren || !expandedIds.has(String(node.item.id))) {
      continue;
    }

    flattenVisibleNodes(node.children, expandedIds, depth + 1, nextAncestorIds, result);
  }
}

export function flattenVisibleContentTree(
  entries: ContentEntry[],
  expandedIds: Set<string>
): FlattenedContentTreeItem[] {
  const result: FlattenedContentTreeItem[] = [];

  flattenVisibleNodes(buildContentTree(entries), expandedIds, 0, [], result);

  return result;
}

export function removeDescendantsOf(
  items: FlattenedContentTreeItem[],
  parentIds: number[]
): FlattenedContentTreeItem[] {
  if (parentIds.length === 0) {
    return items;
  }

  const excludedIds = new Set(parentIds);

  return items.filter((item) =>
    item.ancestorIds.every((ancestorId) => !excludedIds.has(ancestorId))
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function getParentId(
  items: FlattenedContentTreeItem[],
  overIndex: number,
  depth: number
): number | null {
  if (depth === 0) {
    return null;
  }

  const previousItem = items[overIndex - 1];

  if (!previousItem) {
    return null;
  }

  if (depth === previousItem.depth) {
    return previousItem.parentId;
  }

  if (depth > previousItem.depth) {
    return previousItem.id;
  }

  const parentItem = [...items.slice(0, overIndex)].reverse().find((item) => item.depth === depth);

  return parentItem?.parentId ?? null;
}

export function projectContentTreeMove(params: {
  activeId: number;
  horizontalOffset: number;
  indentationWidth: number;
  items: FlattenedContentTreeItem[];
  overId: number;
}): {
  depth: number;
  parentId: number | null;
  position: number;
} | null {
  const { activeId, horizontalOffset, indentationWidth, items, overId } = params;
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const overIndex = items.findIndex((item) => item.id === overId);

  if (activeIndex === -1 || overIndex === -1) {
    return null;
  }

  const activeItem = items[activeIndex];
  if (!activeItem) {
    return null;
  }

  const reorderedItems = arrayMove(items, activeIndex, overIndex);
  const previousItem = reorderedItems[overIndex - 1];
  const nextItem = reorderedItems[overIndex + 1];

  const dragDepth = Math.round(horizontalOffset / indentationWidth);
  const projectedDepth = activeItem.depth + dragDepth;
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;
  const depth = clamp(projectedDepth, minDepth, maxDepth);
  const parentId = getParentId(reorderedItems, overIndex, depth);

  const projectedItems = reorderedItems.map((item, index) =>
    index === overIndex
      ? {
          ...item,
          depth,
          parentId
        }
      : item
  );

  return {
    depth,
    parentId,
    position: projectedItems.slice(0, overIndex).filter((item) => item.parentId === parentId).length
  };
}

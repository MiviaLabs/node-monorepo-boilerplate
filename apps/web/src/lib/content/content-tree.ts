interface ContentTreeItem {
  id: number | string;
  parentId: number | string | null;
  position?: number;
  slug: string;
  title: string;
}

export interface ContentTreeNode<T extends ContentTreeItem> {
  children: ContentTreeNode<T>[];
  item: T;
}

function normalizeId(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

export function buildContentTree<T extends ContentTreeItem>(items: T[]): ContentTreeNode<T>[] {
  const nodeById = new Map<string, ContentTreeNode<T>>();
  const roots: ContentTreeNode<T>[] = [];

  for (const item of items) {
    nodeById.set(String(item.id), {
      item,
      children: []
    });
  }

  for (const item of items) {
    const node = nodeById.get(String(item.id));

    if (!node) {
      continue;
    }

    const parentId = normalizeId(item.parentId);
    const parentNode = parentId ? nodeById.get(parentId) : null;

    if (!parentNode) {
      roots.push(node);
      continue;
    }

    parentNode.children.push(node);
  }

  return sortTreeNodes(roots);
}

function sortTreeNodes<T extends ContentTreeItem>(
  nodes: ContentTreeNode<T>[]
): ContentTreeNode<T>[] {
  nodes.sort((left, right) => {
    const leftPosition = left.item.position ?? 0;
    const rightPosition = right.item.position ?? 0;

    if (leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }

    return String(left.item.id).localeCompare(String(right.item.id), undefined, {
      numeric: true
    });
  });

  for (const node of nodes) {
    sortTreeNodes(node.children);
  }

  return nodes;
}

export function getContentAncestorPath<T extends ContentTreeItem>(
  items: T[],
  selectedSlug?: string
): T[] {
  if (!selectedSlug) {
    return [];
  }

  const itemById = new Map(items.map((item) => [String(item.id), item]));
  const selected = items.find((item) => item.slug === selectedSlug);

  if (!selected) {
    return [];
  }

  const path: T[] = [selected];
  let currentParentId = normalizeId(selected.parentId);

  while (currentParentId) {
    const parent = itemById.get(currentParentId);

    if (!parent) {
      break;
    }

    path.unshift(parent);
    currentParentId = normalizeId(parent.parentId);
  }

  return path;
}

export function getContentAncestorIdSet<T extends ContentTreeItem>(
  items: T[],
  selectedSlug?: string
): Set<string> {
  return new Set(getContentAncestorPath(items, selectedSlug).map((item) => String(item.id)));
}

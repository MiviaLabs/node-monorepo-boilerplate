import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readContentSidebarSectionSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'content-sidebar-section.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('content sidebar architecture', () => {
  it('keeps root and child page creation actions in the sidebar', async () => {
    const source = await readContentSidebarSectionSource();

    expect(source).toContain('onCreateChild: (parentEntry: ContentEntry) => void;');
    expect(source).toContain('onCreateRoot: () => void;');
    expect(source).toContain('aria-label={`Create child page under ${rowTitle}`}');
    expect(source).toContain("aria-label={isCreatingContent ? 'Creating page...' : 'Create page'}");
  });

  it('keeps nested tree rendering and seeds active-path expansion without locking manual collapse', async () => {
    const source = await readContentSidebarSectionSource();

    expect(source).toContain('const ancestorIdsForCurrentPath = useMemo(');
    expect(source).toContain('getContentAncestorIdSet(');
    expect(source).toContain('ancestorIdsForCurrentPath.forEach((id) => {');
    expect(source).toContain('flattenVisibleContentTree(entries, expandedIds)');
    expect(source).toContain('<SortableTreeRow');
    expect(source).toContain('projectedDepth={');
  });

  it('uses a single page icon per row and reveals child creation from the row hover state', async () => {
    const source = await readContentSidebarSectionSource();

    expect(source).toContain('<div className="group flex items-center gap-1">');
    expect(source).toContain(
      '<span className="inline-flex h-6 w-6 shrink-0" aria-hidden="true" />'
    );
    expect(source).toContain('group-hover:opacity-100');
  });

  it('supports explicit drag targets for reorder and nesting moves', async () => {
    const source = await readContentSidebarSectionSource();

    expect(source).toContain('DndContext');
    expect(source).toContain('useSortable');
    expect(source).toContain('PointerSensor');
    expect(source).toContain('sortableKeyboardCoordinates');
    expect(source).toContain('data-content-tree-row');
    expect(source).toContain('data-content-entry-id={item.id}');
    expect(source).toContain('data-content-tree-drag-handle={item.id}');
    expect(source).toContain('projectContentTreeMove({');
    expect(source).toContain(
      'await onMoveEntry(draggedEntryId, moveTarget.parentId, moveTarget.position);'
    );
  });

  it('supports section reorder from a dedicated content header drag handle', async () => {
    const source = await readContentSidebarSectionSource();

    expect(source).toContain('data-sidebar-section-drag-handle={sectionDragHandle.sectionKey}');
    expect(source).toContain('sectionDragHandle.onStartSectionDrag(sectionDragHandle.sectionKey);');
    expect(source).toContain('sectionDragHandle.onDropSection(sectionDragHandle.sectionKey);');
  });
});

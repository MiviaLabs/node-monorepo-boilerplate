'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BookOpenText,
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Plus
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { SidebarSectionKey } from '~/lib/user-settings/sidebar-section-order';
import type { ContentEntry } from '~/types/content.types';

import { Button } from '~/components/ui/button';
import { getContentAncestorIdSet } from '~/lib/content/content-tree';
import {
  flattenVisibleContentTree,
  projectContentTreeMove,
  removeDescendantsOf,
  type FlattenedContentTreeItem
} from '~/lib/content/content-tree-dnd';
import { cn } from '~/lib/utils';

const INDENTATION_WIDTH_PX = 12;
type SortableListeners = ReturnType<typeof useSortable>['listeners'];

interface ContentSidebarSectionProps {
  canCreateContent: boolean;
  canMoveContent: boolean;
  contentHrefPrefix: string;
  emptyStateLabel?: string;
  entries: ContentEntry[];
  isCreatingContent: boolean;
  isMovingContent: boolean;
  isSectionOpen: boolean;
  isSidebarCollapsed: boolean;
  onCreateChild: (parentEntry: ContentEntry) => void;
  onMoveEntry: (entryId: number, parentId: number | null, position: number) => Promise<void>;
  onCreateRoot: () => void;
  onToggle: () => void;
  pathname: string;
  sectionDragHandle?: {
    canDragSection: boolean;
    onClearDraggingSection: () => void;
    onDropSection: (sectionKey: SidebarSectionKey) => void;
    onStartSectionDrag: (sectionKey: SidebarSectionKey) => void;
    sectionKey: SidebarSectionKey;
  };
  sectionTitle: string;
}

function getTreeRowClass(isActive: boolean, isCollapsed: boolean): string {
  return cn(
    'group relative flex items-center text-sm transition-[background-color,color,transform] duration-150',
    isCollapsed
      ? 'h-8 w-8 justify-center rounded-lg md:h-8 md:w-8'
      : 'h-8 gap-2.5 rounded-lg px-2.5 text-sm',
    isActive
      ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
      : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground'
  );
}

function normalizeExpandedIds(entries: ContentEntry[], expandedIds: Set<string>): Set<string> {
  const branchIds = new Set(
    entries
      .filter((entry) => entries.some((candidate) => candidate.parentId === entry.id))
      .map((entry) => String(entry.id))
  );

  return new Set([...expandedIds].filter((id) => branchIds.has(id)));
}

function TreeRowLink({
  href,
  isActive,
  isDragging,
  isOverlay,
  title
}: {
  href: string;
  isActive: boolean;
  isDragging: boolean;
  isOverlay: boolean;
  title: string;
}) {
  const className = cn(
    getTreeRowClass(isActive, false),
    isDragging ? 'opacity-50' : '',
    isOverlay ? 'shadow-lg ring-1 ring-primary/25' : ''
  );

  if (isOverlay) {
    return (
      <div className={className}>
        <FileText className="h-4 w-4 shrink-0" />
        <span className="truncate">{title}</span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      prefetch={false}
      draggable={false}
      onDragStart={(event) => {
        event.preventDefault();
      }}
      className={className}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{title}</span>
    </Link>
  );
}

function TreeRowPresentation({
  canCreateContent,
  canDrag,
  contentHrefPrefix,
  depth,
  isActiveDropTarget,
  isCreatingContent,
  isDragging,
  isOverlay = false,
  isSidebarCollapsed,
  item,
  isTreeExpanded,
  onCreateChild,
  onToggleExpanded,
  pathname,
  projectedDepth,
  setActivatorNodeRef,
  sortableAttributes,
  sortableListeners
}: {
  canCreateContent: boolean;
  canDrag: boolean;
  contentHrefPrefix: string;
  depth: number;
  isActiveDropTarget: boolean;
  isCreatingContent: boolean;
  isDragging: boolean;
  isOverlay?: boolean;
  isSidebarCollapsed: boolean;
  item: FlattenedContentTreeItem;
  isTreeExpanded: boolean;
  onCreateChild: (parentEntry: ContentEntry) => void;
  onToggleExpanded: (nodeId: string) => void;
  pathname: string;
  projectedDepth?: number;
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  sortableAttributes?: DraggableAttributes;
  sortableListeners?: SortableListeners;
}) {
  const href = `${contentHrefPrefix}/${item.slug}`;
  const isActive = pathname === href;
  const rowTitle = item.title.trim() || 'Untitled';
  const effectiveDepth = projectedDepth ?? depth;

  return (
    <div className="group flex items-center gap-1">
      {!isSidebarCollapsed ? (
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1 rounded-lg transition-colors',
            isActiveDropTarget ? 'bg-sidebar-accent/40' : ''
          )}
          style={{ paddingLeft: `${effectiveDepth * INDENTATION_WIDTH_PX}px` }}
        >
          {item.hasChildren ? (
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/48 transition-colors hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
              onClick={() => onToggleExpanded(String(item.id))}
              aria-label={isTreeExpanded ? 'Collapse child pages' : 'Expand child pages'}
            >
              {isTreeExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="inline-flex h-6 w-6 shrink-0" aria-hidden="true" />
          )}

          <button
            ref={setActivatorNodeRef}
            type="button"
            data-content-tree-drag-handle={item.id}
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/42 transition-colors',
              canDrag
                ? 'cursor-grab hover:bg-sidebar-accent/55 hover:text-sidebar-foreground active:cursor-grabbing'
                : 'cursor-not-allowed opacity-50'
            )}
            aria-label={`Move page ${rowTitle}`}
            disabled={!canDrag}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            {...sortableAttributes}
            {...sortableListeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          <div data-content-tree-row data-content-entry-id={item.id} className="min-w-0 flex-1">
            <TreeRowLink
              href={href}
              isActive={isActive}
              isDragging={isDragging}
              isOverlay={isOverlay}
              title={rowTitle}
            />
          </div>
        </div>
      ) : (
        <Link
          href={href}
          prefetch={false}
          draggable={false}
          onDragStart={(event) => {
            event.preventDefault();
          }}
          className={getTreeRowClass(isActive, true)}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="sr-only">{rowTitle}</span>
        </Link>
      )}

      {!isSidebarCollapsed && canCreateContent && !isOverlay ? (
        <Button
          type="button"
          variant="ghost"
          size="tableIcon"
          className="h-7 w-7 rounded-md text-sidebar-foreground/48 opacity-0 transition-opacity hover:bg-sidebar-accent/55 hover:text-sidebar-foreground group-hover:opacity-100"
          onClick={() => onCreateChild(item)}
          disabled={isCreatingContent}
          aria-label={`Create child page under ${rowTitle}`}
          title={`Create child page under ${rowTitle}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function SortableTreeRow({
  activeId,
  canCreateContent,
  canDrag,
  contentHrefPrefix,
  isCreatingContent,
  isSidebarCollapsed,
  item,
  isTreeExpanded,
  onCreateChild,
  onToggleExpanded,
  overId,
  pathname,
  projectedDepth
}: {
  activeId: number | null;
  canCreateContent: boolean;
  canDrag: boolean;
  contentHrefPrefix: string;
  isCreatingContent: boolean;
  isSidebarCollapsed: boolean;
  item: FlattenedContentTreeItem;
  isTreeExpanded: boolean;
  onCreateChild: (parentEntry: ContentEntry) => void;
  onToggleExpanded: (nodeId: string) => void;
  overId: number | null;
  pathname: string;
  projectedDepth?: number;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: item.id,
    disabled: !canDrag
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TreeRowPresentation
        canCreateContent={canCreateContent}
        canDrag={canDrag}
        contentHrefPrefix={contentHrefPrefix}
        depth={item.depth}
        isActiveDropTarget={overId === item.id && activeId !== item.id}
        isCreatingContent={isCreatingContent}
        isDragging={isDragging}
        isTreeExpanded={isTreeExpanded}
        isSidebarCollapsed={isSidebarCollapsed}
        item={item}
        onCreateChild={onCreateChild}
        onToggleExpanded={onToggleExpanded}
        pathname={pathname}
        projectedDepth={activeId === item.id ? projectedDepth : undefined}
        setActivatorNodeRef={setActivatorNodeRef}
        sortableAttributes={attributes}
        sortableListeners={listeners}
      />
    </div>
  );
}

export function ContentSidebarSection({
  canCreateContent,
  canMoveContent,
  contentHrefPrefix,
  emptyStateLabel,
  entries,
  isCreatingContent,
  isMovingContent,
  isSectionOpen,
  isSidebarCollapsed,
  onCreateChild,
  onMoveEntry,
  onCreateRoot,
  onToggle,
  pathname,
  sectionDragHandle,
  sectionTitle
}: ContentSidebarSectionProps) {
  const ancestorIdsForCurrentPath = useMemo(
    () =>
      getContentAncestorIdSet(
        entries,
        pathname.startsWith(`${contentHrefPrefix}/`)
          ? pathname.slice(contentHrefPrefix.length + 1)
          : undefined
      ),
    [contentHrefPrefix, entries, pathname]
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () =>
      new Set(
        entries
          .filter((entry) => entries.some((candidate) => candidate.parentId === entry.id))
          .map((entry) => String(entry.id))
      )
  );
  const [draggedEntryId, setDraggedEntryId] = useState<number | null>(null);
  const [overEntryId, setOverEntryId] = useState<number | null>(null);
  const [horizontalOffset, setHorizontalOffset] = useState(0);

  useEffect(() => {
    setExpandedIds((current) => normalizeExpandedIds(entries, current));
  }, [entries]);

  useEffect(() => {
    if (ancestorIdsForCurrentPath.size === 0) {
      return;
    }

    setExpandedIds((current) => {
      const next = new Set(current);

      ancestorIdsForCurrentPath.forEach((id) => {
        next.add(id);
      });

      return next;
    });
  }, [ancestorIdsForCurrentPath]);

  const visibleItems = useMemo(
    () => flattenVisibleContentTree(entries, expandedIds),
    [entries, expandedIds]
  );

  const sortableItems = useMemo(
    () =>
      draggedEntryId === null ? visibleItems : removeDescendantsOf(visibleItems, [draggedEntryId]),
    [draggedEntryId, visibleItems]
  );

  const activeItem = useMemo(
    () => visibleItems.find((item) => item.id === draggedEntryId) ?? null,
    [draggedEntryId, visibleItems]
  );

  const projectedMove = useMemo(() => {
    if (draggedEntryId === null || overEntryId === null) {
      return null;
    }

    return projectContentTreeMove({
      activeId: draggedEntryId,
      horizontalOffset,
      indentationWidth: INDENTATION_WIDTH_PX,
      items: sortableItems,
      overId: overEntryId
    });
  }, [draggedEntryId, horizontalOffset, overEntryId, sortableItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const toggleExpanded = (nodeId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  };

  const resetDragState = () => {
    setDraggedEntryId(null);
    setOverEntryId(null);
    setHorizontalOffset(0);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedEntryId(Number(event.active.id));
    setOverEntryId(Number(event.active.id));
    setHorizontalOffset(0);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    setHorizontalOffset(event.delta.x);
    setOverEntryId(event.over ? Number(event.over.id) : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (draggedEntryId === null || !event.over || !projectedMove) {
      resetDragState();
      return;
    }

    const moveTarget = projectedMove;

    if (moveTarget.parentId === draggedEntryId) {
      resetDragState();
      return;
    }

    if (moveTarget.parentId !== null) {
      setExpandedIds((current) => new Set(current).add(String(moveTarget.parentId)));
    }

    try {
      await onMoveEntry(draggedEntryId, moveTarget.parentId, moveTarget.position);
    } catch (error) {
      toast.error('Failed to move page', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      resetDragState();
    }
  };

  if (!entries.length && !emptyStateLabel) {
    return null;
  }

  const shouldAllowDnD = canMoveContent && !isSidebarCollapsed && !isMovingContent;

  return (
    <div className="space-y-1">
      {!isSidebarCollapsed ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            data-sidebar-section-header={sectionTitle}
            className="flex min-w-0 flex-1 items-center justify-between rounded-md px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/42 transition-colors hover:bg-sidebar-accent/35 hover:text-sidebar-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              {sectionDragHandle ? (
                <span
                  role="button"
                  tabIndex={-1}
                  draggable={sectionDragHandle.canDragSection}
                  data-sidebar-section-drag-handle={sectionDragHandle.sectionKey}
                  aria-label={`Reorder ${sectionTitle} section`}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    sectionDragHandle.onStartSectionDrag(sectionDragHandle.sectionKey);
                  }}
                  onDragEnd={(event) => {
                    event.stopPropagation();
                    sectionDragHandle.onClearDraggingSection();
                  }}
                  onDragOver={(event) => {
                    if (!sectionDragHandle.canDragSection) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    sectionDragHandle.onDropSection(sectionDragHandle.sectionKey);
                  }}
                  className="inline-flex h-4 w-4 shrink-0 cursor-grab items-center justify-center rounded-sm text-sidebar-foreground/36 transition-colors hover:bg-sidebar-accent/35 hover:text-sidebar-foreground active:cursor-grabbing"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
              ) : null}
              {sectionTitle}
            </span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                isSectionOpen ? 'rotate-0' : '-rotate-90'
              )}
            />
          </button>
          {canCreateContent ? (
            <Button
              type="button"
              variant="ghost"
              size="tableIcon"
              className="h-7 w-7 rounded-md text-sidebar-foreground/56 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
              onClick={onCreateRoot}
              disabled={isCreatingContent || isMovingContent}
              aria-label={isCreatingContent ? 'Creating page...' : 'Create page'}
              title={isCreatingContent ? 'Creating page...' : 'Create page'}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}

      {(isSectionOpen || isSidebarCollapsed) && (
        <div className="space-y-0.5">
          {isSidebarCollapsed ? (
            <Link
              href={contentHrefPrefix}
              prefetch={false}
              className={getTreeRowClass(
                pathname === contentHrefPrefix || pathname.startsWith(`${contentHrefPrefix}/`),
                true
              )}
              title={sectionTitle}
            >
              <BookOpenText className="h-4 w-4 shrink-0" />
              <span className="sr-only">{sectionTitle}</span>
            </Link>
          ) : null}

          {!isSidebarCollapsed && entries.length === 0 && emptyStateLabel ? (
            <p className="px-3 py-2 text-xs text-sidebar-foreground/48">{emptyStateLabel}</p>
          ) : null}

          {!isSidebarCollapsed && sortableItems.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={(event) => {
                void handleDragEnd(event);
              }}
              onDragCancel={resetDragState}
            >
              <SortableContext
                items={sortableItems.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-0.5">
                  {sortableItems.map((item) => (
                    <SortableTreeRow
                      key={item.id}
                      activeId={draggedEntryId}
                      canCreateContent={canCreateContent}
                      canDrag={shouldAllowDnD}
                      contentHrefPrefix={contentHrefPrefix}
                      isCreatingContent={isCreatingContent || isMovingContent}
                      isSidebarCollapsed={false}
                      item={item}
                      isTreeExpanded={item.hasChildren && expandedIds.has(String(item.id))}
                      onCreateChild={onCreateChild}
                      onToggleExpanded={toggleExpanded}
                      overId={overEntryId}
                      pathname={pathname}
                      projectedDepth={
                        draggedEntryId === item.id
                          ? (projectedMove?.depth ?? item.depth)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </SortableContext>

              <DragOverlay>
                {activeItem ? (
                  <div className="w-[240px] max-w-[calc(100vw-3rem)] rounded-lg bg-sidebar-background/95 p-1 shadow-xl">
                    <TreeRowPresentation
                      canCreateContent={false}
                      canDrag={false}
                      contentHrefPrefix={contentHrefPrefix}
                      depth={activeItem.depth}
                      isActiveDropTarget={false}
                      isCreatingContent={false}
                      isDragging={false}
                      isTreeExpanded={
                        activeItem.hasChildren && expandedIds.has(String(activeItem.id))
                      }
                      isOverlay
                      isSidebarCollapsed={false}
                      item={activeItem}
                      onCreateChild={onCreateChild}
                      onToggleExpanded={toggleExpanded}
                      pathname={pathname}
                      projectedDepth={projectedMove?.depth ?? activeItem.depth}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : null}
        </div>
      )}
    </div>
  );
}

'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { ListTree } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '~/lib/utils';

type TocEntry = {
  anchorId: string;
  level: number;
  title: string;
};

function ContentTableOfContentsNodeView({ editor, selected }: NodeViewProps) {
  const items = useMemo(() => {
    const headings: TocEntry[] = [];

    editor.state.doc.descendants((node) => {
      if (node.type.name !== 'heading' || typeof node.attrs.anchorId !== 'string') {
        return;
      }

      const title = node.textContent.trim();

      if (!title) {
        return;
      }

      headings.push({
        anchorId: node.attrs.anchorId,
        level: Number(node.attrs.level ?? 1),
        title
      });
    });

    return headings;
  }, [editor.state.doc, editor.state.selection]);

  return (
    <NodeViewWrapper
      className={cn(
        'my-6 rounded-2xl border border-border/70 bg-[hsl(var(--panel-subtle)/0.28)] px-4 py-4',
        selected ? 'ring-2 ring-primary/25' : ''
      )}
      data-content-table-of-contents="true"
      contentEditable={false}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ListTree className="h-4 w-4 text-muted-foreground" />
        Contents
      </div>

      {items.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {items.map((item) => (
            <button
              key={item.anchorId}
              type="button"
              onClick={() => {
                const target = document.getElementById(item.anchorId);

                if (!target) {
                  return;
                }

                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                window.history.replaceState(null, '', `#${item.anchorId}`);
              }}
              className={cn(
                'block text-left text-sm text-muted-foreground transition-colors hover:text-foreground',
                item.level === 2 ? 'pl-3' : '',
                item.level === 3 ? 'pl-6' : '',
                item.level >= 4 ? 'pl-9' : ''
              )}
            >
              {item.title}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">
          Add headings to populate this table of contents.
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const ContentTableOfContentsExtension = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-content-table-of-contents]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-content-table-of-contents': 'true' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ContentTableOfContentsNodeView);
  }
});

'use client';

import CodeBlock from '@tiptap/extension-code-block';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps
} from '@tiptap/react';
import {
  Columns2,
  ChevronDown,
  Copy,
  Expand,
  Eye,
  FileCode2,
  Minus,
  Plus,
  SplitSquareVertical
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { toast } from 'sonner';

import {
  ContentMermaidPreview,
  isMermaidLanguage,
  MermaidPreviewMode
} from './content-mermaid-preview';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { cn } from '~/lib/utils';

const enum MermaidViewMode {
  Code = 'code',
  Preview = 'preview',
  Split = 'split'
}

const CODE_BLOCK_LANGUAGES = [
  { label: 'Plain text', value: '' },
  { label: 'Mermaid', value: 'mermaid' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TSX', value: 'tsx' },
  { label: 'JSX', value: 'jsx' },
  { label: 'JSON', value: 'json' },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'SQL', value: 'sql' },
  { label: 'Bash', value: 'bash' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'YAML', value: 'yaml' }
] as const;

function IconButton({
  active = false,
  children,
  className,
  onClick,
  title
}: {
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors',
        active
          ? 'bg-foreground/14 text-foreground'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  );
}

function ContentCodeBlockNodeView({ editor, node, selected, updateAttributes }: NodeViewProps) {
  const [mermaidViewMode, setMermaidViewMode] = useState<MermaidViewMode>(MermaidViewMode.Preview);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedScale, setExpandedScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const expandedViewportRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const language = (node.attrs.language as string | null | undefined) ?? '';
  const code = node.textContent;
  const canEdit = editor.isEditable;
  const isMermaid = isMermaidLanguage(language);
  const shouldShowCode = !isMermaid || mermaidViewMode !== MermaidViewMode.Preview;
  const shouldShowPreview = isMermaid && mermaidViewMode !== MermaidViewMode.Code;
  const languageLabel =
    CODE_BLOCK_LANGUAGES.find((option) => option.value === language.trim().toLowerCase())?.label ??
    (language.trim() || 'Plain text');

  useEffect(() => {
    if (!isExpanded) {
      setExpandedScale(1);
      setIsPanning(false);
      panStateRef.current = null;
    }
  }, [isExpanded]);

  const handleExpandedPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const viewport = expandedViewportRef.current;

    if (!viewport) {
      return;
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleExpandedPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = expandedViewportRef.current;
    const panState = panStateRef.current;

    if (!viewport || panState?.pointerId !== event.pointerId) {
      return;
    }

    viewport.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
    viewport.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  };

  const handleExpandedPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (panStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    panStateRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const codePanel = useMemo(
    () => (
      <div
        className={cn(
          'min-w-0 rounded-2xl border border-border/70 bg-slate-950 text-slate-100',
          shouldShowPreview ? 'min-h-[260px]' : ''
        )}
      >
        <pre className="overflow-x-auto px-4 pb-4 pt-12">
          <NodeViewContent className="block whitespace-pre-wrap wrap-break-word font-mono text-[13px] leading-6 outline-hidden" />
        </pre>
      </div>
    ),
    [shouldShowPreview]
  );

  const previewPanel = useMemo(
    () =>
      isMermaid ? <ContentMermaidPreview code={code} className="min-h-[260px] pt-10" /> : null,
    [code, isMermaid]
  );

  return (
    <NodeViewWrapper
      className={cn(
        'group/code-block relative my-6 transition-colors',
        selected ? 'ring-2 ring-primary/30' : ''
      )}
      data-content-code-block={language || 'plain'}
    >
      <div className="relative">
        <div
          contentEditable={false}
          className={cn(
            'pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3 transition-opacity',
            'opacity-0 group-hover/code-block:opacity-100 group-focus-within/code-block:opacity-100'
          )}
        >
          <div className="pointer-events-auto flex min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={!canEdit}>
                <button
                  type="button"
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:hover:bg-background disabled:hover:text-muted-foreground"
                  title={canEdit ? 'Select code block language' : 'Code block language'}
                  aria-label="Code block language"
                >
                  <span className="truncate">{languageLabel}</span>
                  {canEdit ? <ChevronDown className="h-2.5 w-2.5 shrink-0" /> : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                {CODE_BLOCK_LANGUAGES.map((option) => (
                  <DropdownMenuItem
                    key={option.label}
                    onSelect={() => updateAttributes({ language: option.value })}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-xs">
            {isMermaid ? (
              <>
                <IconButton
                  active={mermaidViewMode === MermaidViewMode.Code}
                  onClick={() => setMermaidViewMode(MermaidViewMode.Code)}
                  title="Show code"
                >
                  <FileCode2 className="h-3 w-3" />
                </IconButton>
                <IconButton
                  active={mermaidViewMode === MermaidViewMode.Preview}
                  onClick={() => setMermaidViewMode(MermaidViewMode.Preview)}
                  title="Show preview"
                >
                  <Eye className="h-3 w-3" />
                </IconButton>
                <IconButton
                  active={mermaidViewMode === MermaidViewMode.Split}
                  onClick={() => setMermaidViewMode(MermaidViewMode.Split)}
                  title="Show split view"
                >
                  <Columns2 className="h-3 w-3" />
                </IconButton>
                <IconButton onClick={() => setIsExpanded(true)} title="Expand diagram preview">
                  <Expand className="h-3 w-3" />
                </IconButton>
              </>
            ) : null}
            <IconButton
              onClick={() => {
                void navigator.clipboard.writeText(code).then(
                  () => {
                    toast.success('Code copied');
                  },
                  () => {
                    toast.error('Failed to copy code');
                  }
                );
              }}
              title="Copy code"
            >
              <Copy className="h-3 w-3" />
            </IconButton>
          </div>
        </div>

        {isMermaid ? (
          <div
            className={cn(
              'grid gap-3',
              mermaidViewMode === MermaidViewMode.Split
                ? 'grid-cols-1 xl:grid-cols-2'
                : 'grid-cols-1'
            )}
          >
            {shouldShowCode ? codePanel : null}
            {shouldShowPreview ? previewPanel : null}
          </div>
        ) : (
          codePanel
        )}
      </div>

      {isMermaid ? (
        <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
          <DialogContent className="max-h-[90vh] max-w-[min(1100px,calc(100vw-2rem))] overflow-hidden border-border bg-background p-0 text-foreground">
            <div className="flex items-start justify-between gap-4 border-b border-border/70 px-6 py-4">
              <DialogHeader className="space-y-1 p-0">
                <DialogTitle className="flex items-center gap-2">
                  <SplitSquareVertical className="h-4 w-4 text-muted-foreground" />
                  Mermaid diagram preview
                </DialogTitle>
                <DialogDescription>
                  Zoom and drag to inspect large diagrams without leaving the editor.
                </DialogDescription>
              </DialogHeader>
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border/70 bg-background/95 p-1 shadow-xs">
                <IconButton
                  onClick={() => setExpandedScale((current) => Math.max(0.5, current - 0.1))}
                  title="Zoom out"
                >
                  <Minus className="h-4 w-4" />
                </IconButton>
                <div className="min-w-18 px-2 text-center text-xs font-medium tabular-nums text-muted-foreground">
                  {Math.round(expandedScale * 100)}%
                </div>
                <IconButton
                  onClick={() => setExpandedScale((current) => Math.min(2.5, current + 0.1))}
                  title="Zoom in"
                >
                  <Plus className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
            <div
              ref={expandedViewportRef}
              className={cn(
                'max-h-[calc(90vh-5rem)] overflow-auto bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.12),transparent_42%)] p-6',
                isPanning ? 'cursor-grabbing' : 'cursor-grab'
              )}
              onPointerDown={handleExpandedPointerDown}
              onPointerMove={handleExpandedPointerMove}
              onPointerUp={handleExpandedPointerEnd}
              onPointerCancel={handleExpandedPointerEnd}
            >
              <div className="flex min-h-full min-w-full items-start justify-start">
                <ContentMermaidPreview
                  code={code}
                  mode={MermaidPreviewMode.Overlay}
                  scale={expandedScale}
                  className="min-h-[420px] overflow-visible"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </NodeViewWrapper>
  );
}

export const ContentCodeBlockExtension = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ContentCodeBlockNodeView);
  }
}).configure({
  HTMLAttributes: {
    class: 'content-code-block'
  }
});

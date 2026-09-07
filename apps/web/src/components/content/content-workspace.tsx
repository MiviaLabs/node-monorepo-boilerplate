'use client';

import LinkExtension from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  CheckCircle2,
  ChevronRight,
  CopyCheck,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Trash2,
  List,
  ListChecks,
  ListOrdered,
  LoaderCircle,
  ListTree,
  Minus,
  MoreHorizontal,
  Pilcrow,
  Quote,
  Share2,
  SplitSquareVertical,
  SquareCode,
  Star,
  Underline as UnderlineIcon
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ContentCodeBlockExtension } from './content-code-block-node';
import { ContentHeadingExtension } from './content-heading-extension';
import { filterSlashCommandItems, getSlashCommandMatch } from './content-slash-menu';
import { ContentTableOfContentsExtension } from './content-table-of-contents-node';

import type { SlashCommandId } from './content-slash-menu';
import type { ContentDocNode, ContentPage, ContentVersion } from './content-types';
import type { ContentEntry } from '~/types/content.types';

import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Separator } from '~/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { contentApi, isContentConflictError } from '~/lib/api/content-api';
import {
  buildStructuredContentConflictDiff,
  summarizeStructuredContentConflictDiff
} from '~/lib/content/content-conflict-diff';
import {
  clearStoredContentDraft,
  readStoredContentDraft,
  shouldRestoreStoredContentDraft,
  writeStoredContentDraft
} from '~/lib/content/content-draft-storage';
import { buildContentSaveInput } from '~/lib/content/content-save';
import { extractContentTitleAndBody } from '~/lib/projects/project-content-markdown';
import { cn } from '~/lib/utils';

function getCurrentVersion(page: ContentPage): ContentVersion {
  const firstVersion = page.versions[0];

  if (!firstVersion) {
    throw new Error(`Content page ${page.id} is missing versions.`);
  }

  return page.versions.find((version) => version.isCurrent) ?? firstVersion;
}

const CONTENT_AUTOSAVE_DELAY_MS = 900;
const SLASH_MENU_WIDTH_PX = 380;

type SlashMenuState = {
  left: number;
  query: string;
  range: { from: number; to: number };
  selectedIndex: number;
  top: number;
};

type ContentSaveTransportOptions = {
  keepalive?: boolean;
};

type ContentSavePayload = {
  baseRevision: string;
  pageId: string;
  currentSlug: string;
  title: string;
  slug: string;
  contentMarkdown: string;
};

type ContentSaveResult = {
  revision: string;
  slug: string;
};

type ContentConflictPreview = {
  title: string;
  slug: string;
  contentMarkdown: string;
  revision: string;
  savedAt: string;
  body?: ContentDocNode;
  hasExplicitSlugOverride?: boolean;
};

function buildContentSaveSnapshot(payload: ContentSavePayload): string {
  return JSON.stringify({
    pageId: payload.pageId,
    currentSlug: payload.currentSlug,
    title: payload.title,
    slug: payload.slug,
    contentMarkdown: payload.contentMarkdown
  });
}

function getConflictSummary(
  local: ContentConflictPreview | null,
  server: ContentConflictPreview | null
) {
  if (!local || !server) {
    return [];
  }

  return [
    local.title !== server.title ? 'Title changed' : null,
    local.slug !== server.slug ? 'Slug changed' : null,
    local.contentMarkdown !== server.contentMarkdown ? 'Body changed' : null
  ].filter((value): value is string => value !== null);
}

function buildConflictPreviewFromEntry(entry: ContentEntry): ContentConflictPreview {
  return {
    title: entry.title,
    slug: entry.slug,
    contentMarkdown: entry.contentMarkdown,
    revision: entry.revision ?? new Date(entry.updatedAt).toISOString(),
    savedAt: entry.updatedAt
  };
}

function getConflictPreviewExcerpt(contentMarkdown: string): string {
  return contentMarkdown.length > 1200
    ? `${contentMarkdown.slice(0, 1197).trimEnd()}\n...`
    : contentMarkdown;
}

function formatConflictTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getAvatarInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'U';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const SLASH_COMMAND_ICONS: Record<SlashCommandId, React.ComponentType<{ className?: string }>> = {
  text: Pilcrow,
  'heading-1': Heading1,
  'heading-2': Heading2,
  'heading-3': Heading3,
  'heading-4': Heading4,
  'table-of-contents': ListTree,
  bullets: List,
  'numbered-list': ListOrdered,
  'task-list': ListChecks,
  quote: Quote,
  'code-block': SquareCode,
  mermaid: SplitSquareVertical,
  divider: Minus
};

function getTextBeforeCursor(editor: NonNullable<ReturnType<typeof useEditor>>) {
  const { $from } = editor.state.selection;

  if (!editor.state.selection.empty || !$from.parent.isTextblock) {
    return null;
  }

  return $from.parent.textBetween(0, $from.parentOffset, '\0', '\0');
}

function getSlashMenuPlacement(coords: { bottom: number; left: number }) {
  return {
    left: Math.max(16, Math.min(coords.left, window.innerWidth - SLASH_MENU_WIDTH_PX - 16)),
    top: Math.max(16, Math.min(coords.bottom + 10, window.innerHeight - 24))
  };
}

function executeSlashCommand(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  commandId: SlashCommandId,
  range: { from: number; to: number }
) {
  const chain = editor.chain().focus().deleteRange(range);

  switch (commandId) {
    case 'text':
      chain.setParagraph().run();
      return;
    case 'heading-1':
      chain.setHeading({ level: 1 }).run();
      return;
    case 'heading-2':
      chain.setHeading({ level: 2 }).run();
      return;
    case 'heading-3':
      chain.setHeading({ level: 3 }).run();
      return;
    case 'heading-4':
      chain.setHeading({ level: 4 }).run();
      return;
    case 'bullets':
      chain.toggleBulletList().run();
      return;
    case 'table-of-contents':
      chain.insertContent({ type: 'tableOfContents' }).run();
      return;
    case 'numbered-list':
      chain.toggleOrderedList().run();
      return;
    case 'task-list':
      chain.toggleTaskList().run();
      return;
    case 'quote':
      chain.toggleBlockquote().run();
      return;
    case 'code-block':
      chain.toggleCodeBlock().run();
      return;
    case 'mermaid':
      chain
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [
            {
              type: 'text',
              text: 'flowchart TD\n  Start[Start] --> Review[Review]\n  Review --> Done[Done]'
            }
          ]
        })
        .run();
      return;
    case 'divider':
      chain.setHorizontalRule().run();
      return;
  }
}

function ToolbarButton({
  children,
  isActive = false,
  onClick
}: {
  children: import('react').ReactNode;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
        isActive
          ? 'bg-foreground/8 text-foreground'
          : 'text-muted-foreground hover:bg-foreground/4 hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function EditorToolbar({
  canEdit,
  editor
}: {
  canEdit: boolean;
  editor: NonNullable<ReturnType<typeof useEditor>>;
}) {
  const currentTextStyle = editor.isActive('heading', { level: 1 })
    ? 'heading-1'
    : editor.isActive('heading', { level: 2 })
      ? 'heading-2'
      : editor.isActive('heading', { level: 3 })
        ? 'heading-3'
        : editor.isActive('heading', { level: 4 })
          ? 'heading-4'
          : 'paragraph';

  const applyTextStyle = (value: string) => {
    if (!canEdit) {
      return;
    }

    const chain = editor.chain().focus();

    switch (value) {
      case 'paragraph':
        chain.setParagraph().run();
        return;
      case 'heading-1':
        chain.toggleHeading({ level: 1 }).run();
        return;
      case 'heading-2':
        chain.toggleHeading({ level: 2 }).run();
        return;
      case 'heading-3':
        chain.toggleHeading({ level: 3 }).run();
        return;
      case 'heading-4':
        chain.toggleHeading({ level: 4 }).run();
        return;
      default:
        return;
    }
  };

  const actions = [
    {
      key: 'bullet-list',
      label: 'Bullets',
      icon: List,
      active: editor.isActive('bulletList'),
      onClick: () => editor.chain().focus().toggleBulletList().run()
    },
    {
      key: 'ordered-list',
      label: 'Steps',
      icon: ListOrdered,
      active: editor.isActive('orderedList'),
      onClick: () => editor.chain().focus().toggleOrderedList().run()
    },
    {
      key: 'tasks',
      label: 'Tasks',
      icon: ListChecks,
      active: editor.isActive('taskList'),
      onClick: () => editor.chain().focus().toggleTaskList().run()
    },
    {
      key: 'quote',
      label: 'Quote',
      icon: Quote,
      active: editor.isActive('blockquote'),
      onClick: () => editor.chain().focus().toggleBlockquote().run()
    },
    {
      key: 'code',
      label: 'Code',
      icon: SquareCode,
      active: editor.isActive('codeBlock'),
      onClick: () => editor.chain().focus().toggleCodeBlock().run()
    },
    {
      key: 'underline',
      label: 'Underline',
      icon: UnderlineIcon,
      active: editor.isActive('underline'),
      onClick: () => editor.chain().focus().toggleUnderline().run()
    }
  ] as const;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-xl bg-background/88 px-1.5 py-1 backdrop-blur-sm">
      <Select value={currentTextStyle} onValueChange={applyTextStyle}>
        <SelectTrigger className="h-8 w-[124px] rounded-md border-none bg-transparent px-2.5 py-1 text-xs font-medium shadow-none hover:bg-foreground/4 focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="paragraph">Text</SelectItem>
          <SelectItem value="heading-1">H1</SelectItem>
          <SelectItem value="heading-2">H2</SelectItem>
          <SelectItem value="heading-3">H3</SelectItem>
          <SelectItem value="heading-4">H4</SelectItem>
        </SelectContent>
      </Select>

      {actions.map((action) => (
        <ToolbarButton
          key={action.key}
          isActive={action.active}
          onClick={() => {
            if (!canEdit) {
              return;
            }

            action.onClick();
          }}
        >
          <action.icon className="h-3.5 w-3.5" />
          {action.label}
        </ToolbarButton>
      ))}
    </div>
  );
}

export function ContentWorkspace({
  breadcrumbs = [],
  pages,
  selectedPageSlug,
  canEdit = true,
  canDelete = false,
  emptyStateTitle = 'No pages yet',
  emptyStateDescription = 'Create a page from the sidebar to start writing.',
  onSave,
  onDelete
}: {
  breadcrumbs?: Array<{ href?: string; label: string }>;
  pages: ContentPage[];
  selectedPageSlug?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  onSave?: (
    input: {
      baseRevision: string;
      pageId: string;
      currentSlug: string;
      title: string;
      slug: string;
      contentMarkdown: string;
    },
    options?: ContentSaveTransportOptions
  ) => Promise<ContentSaveResult>;
  onDelete?: (page: ContentPage) => Promise<void>;
}) {
  const page = useMemo(
    () => pages.find((candidate) => candidate.slug === selectedPageSlug) ?? pages[0] ?? null,
    [pages, selectedPageSlug]
  );
  const currentVersion = page ? getCurrentVersion(page) : null;
  const normalizedContent = useMemo(
    () =>
      currentVersion && page
        ? extractContentTitleAndBody(currentVersion.content, page.title)
        : null,
    [currentVersion, page]
  );
  const [titleValue, setTitleValue] = useState(normalizedContent?.title ?? page?.title ?? '');
  const [slugValue, setSlugValue] = useState(page?.slug ?? '');
  const [isSlugEditorOpen, setIsSlugEditorOpen] = useState(false);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [isConflictComparisonLoading, setIsConflictComparisonLoading] = useState(false);
  const [conflictLoadError, setConflictLoadError] = useState<string | null>(null);
  const [conflictLocalPreview, setConflictLocalPreview] = useState<ContentConflictPreview | null>(
    null
  );
  const [conflictServerPreview, setConflictServerPreview] = useState<ContentConflictPreview | null>(
    null
  );
  const [isRestoreDraftDialogOpen, setIsRestoreDraftDialogOpen] = useState(false);
  const [restoreDraftSavedAt, setRestoreDraftSavedAt] = useState<string | null>(null);
  const [hasExplicitSlugOverride, setHasExplicitSlugOverride] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'saving' | 'error' | 'conflict'>(
    'saved'
  );
  const [editorRevision, setEditorRevision] = useState(0);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const lastHydratedPageIdRef = useRef<string | null>(null);
  const currentRevisionRef = useRef<string | null>(currentVersion?.revision ?? null);
  const currentSlugRef = useRef<string | null>(page?.slug ?? null);
  const lastSyncedPreviewRef = useRef<ContentConflictPreview | null>(null);
  const pendingRestoreDraftRef = useRef<ReturnType<typeof readStoredContentDraft>>(null);
  const latestDraftPayloadRef = useRef<ContentSavePayload | null>(null);
  const latestDraftSnapshotRef = useRef<string | null>(null);
  const queuedSaveRef = useRef<{
    options?: ContentSaveTransportOptions;
    payload: ContentSavePayload;
    snapshot: string;
  } | null>(null);
  const inFlightSaveRef = useRef<{ requestId: number; snapshot: string } | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef(0);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const slashMenuRef = useRef<SlashMenuState | null>(null);

  const slashCommands = useMemo(
    () => filterSlashCommandItems(slashMenu?.query ?? ''),
    [slashMenu?.query]
  );
  const slashCommandsRef = useRef(slashCommands);

  const clearScheduledSave = () => {
    if (saveTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  };

  const buildCurrentLocalConflictPreview = (): ContentConflictPreview | null => {
    if (!page || !editor) {
      return null;
    }

    const storedDraft = readStoredContentDraft(page.id);

    if (storedDraft) {
      return {
        title: storedDraft.title,
        slug: storedDraft.slugValue ?? storedDraft.currentSlug,
        contentMarkdown:
          latestDraftPayloadRef.current?.contentMarkdown ??
          buildContentSaveInput({
            baseRevision: storedDraft.baseRevision,
            pageId: storedDraft.pageId,
            currentSlug: storedDraft.currentSlug,
            slugValue: storedDraft.slugValue,
            title: storedDraft.title,
            body: storedDraft.body
          }).contentMarkdown,
        revision: storedDraft.baseRevision,
        savedAt: storedDraft.savedAt,
        body: storedDraft.body,
        hasExplicitSlugOverride: storedDraft.hasExplicitSlugOverride
      };
    }

    const body = editor.getJSON() as ContentDocNode;
    const payload = buildContentSaveInput({
      baseRevision: currentRevisionRef.current || new Date().toISOString(),
      pageId: page.id,
      currentSlug: currentSlugRef.current || page.slug,
      slugValue: hasExplicitSlugOverride ? slugValue : undefined,
      title: titleValue,
      body
    });

    return {
      title: payload.title,
      slug: payload.slug,
      contentMarkdown: payload.contentMarkdown,
      revision: payload.baseRevision,
      savedAt: new Date().toISOString(),
      body,
      hasExplicitSlugOverride
    };
  };

  const applyServerPreview = (preview: ContentConflictPreview) => {
    if (!editor || !page) {
      return;
    }

    const normalized = extractContentTitleAndBody(preview.contentMarkdown, preview.title);
    const serverPayload = buildContentSaveInput({
      baseRevision: preview.revision,
      pageId: page.id,
      currentSlug: preview.slug,
      title: normalized.title,
      body: normalized.body
    });
    const serverSnapshot = buildContentSaveSnapshot(serverPayload);

    editor.commands.setContent(normalized.body, { emitUpdate: false });
    setTitleValue(normalized.title);
    setSlugValue(preview.slug);
    setHasExplicitSlugOverride(false);
    currentRevisionRef.current = preview.revision;
    currentSlugRef.current = preview.slug;
    lastSavedSnapshotRef.current = serverSnapshot;
    latestDraftPayloadRef.current = serverPayload;
    latestDraftSnapshotRef.current = serverSnapshot;
    lastSyncedPreviewRef.current = preview;
    clearStoredContentDraft(page.id);
    pendingRestoreDraftRef.current = null;
    setSaveState('saved');
    setEditorRevision(0);
    setIsConflictDialogOpen(false);
    setIsConflictComparisonLoading(false);
    setConflictLoadError(null);
    setConflictLocalPreview(null);
    setConflictServerPreview(null);
  };

  const openConflictResolution = async (payload: ContentSavePayload) => {
    const localPreview = buildCurrentLocalConflictPreview();

    setConflictLocalPreview(localPreview);
    setConflictServerPreview(lastSyncedPreviewRef.current);
    setConflictLoadError(null);
    setIsConflictDialogOpen(true);
    setIsConflictComparisonLoading(true);

    try {
      const latestEntry = await contentApi.getContentEntry(Number(payload.pageId));
      setConflictServerPreview(buildConflictPreviewFromEntry(latestEntry));
    } catch (error) {
      setConflictLoadError(
        error instanceof Error ? error.message : 'Unable to load the latest server version.'
      );
    } finally {
      setIsConflictComparisonLoading(false);
    }
  };

  const performSave = async (
    payload: ContentSavePayload,
    snapshot: string,
    options?: ContentSaveTransportOptions
  ) => {
    if (!onSave) {
      return;
    }

    clearScheduledSave();

    if (inFlightSaveRef.current !== null) {
      queuedSaveRef.current = { payload, snapshot, options };
      setSaveState('pending');
      return;
    }

    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    inFlightSaveRef.current = { requestId, snapshot };
    setSaveState('saving');

    try {
      const result = await onSave(payload, options);

      if (inFlightSaveRef.current?.requestId !== requestId) {
        return;
      }

      inFlightSaveRef.current = null;
      currentRevisionRef.current = result.revision;
      currentSlugRef.current = result.slug;
      setHasExplicitSlugOverride(false);
      setSlugValue(result.slug);
      lastSavedSnapshotRef.current = snapshot;
      lastSyncedPreviewRef.current = {
        title: payload.title,
        slug: result.slug,
        contentMarkdown: payload.contentMarkdown,
        revision: result.revision,
        savedAt: new Date().toISOString()
      };
      clearStoredContentDraft(payload.pageId);

      const queuedSave = queuedSaveRef.current;
      queuedSaveRef.current = null;

      if (queuedSave !== null && queuedSave.snapshot !== snapshot) {
        const nextQueuedPayload = {
          ...queuedSave.payload,
          baseRevision: result.revision,
          currentSlug: result.slug
        };
        setSaveState('pending');
        latestDraftPayloadRef.current = nextQueuedPayload;
        void performSave(nextQueuedPayload, queuedSave.snapshot, queuedSave.options);
        return;
      }

      setSaveState(latestDraftSnapshotRef.current === snapshot ? 'saved' : 'pending');
    } catch (error) {
      if (inFlightSaveRef.current?.requestId !== requestId) {
        return;
      }

      inFlightSaveRef.current = null;

      if (isContentConflictError(error)) {
        queuedSaveRef.current = null;
        clearScheduledSave();
        setSaveState('conflict');
        void openConflictResolution(payload);
        return;
      }

      setSaveState('error');
      toast.error('Failed to save page', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    }
  };

  const flushDraft = (options?: ContentSaveTransportOptions) => {
    const payload = latestDraftPayloadRef.current;
    const snapshot = latestDraftSnapshotRef.current;

    if (
      !payload ||
      !snapshot ||
      snapshot === lastSavedSnapshotRef.current ||
      saveState === 'conflict'
    ) {
      return;
    }

    void performSave(payload, snapshot, options);
  };

  useEffect(() => {
    slashMenuRef.current = slashMenu;
  }, [slashMenu]);

  useEffect(() => {
    slashCommandsRef.current = slashCommands;
  }, [slashCommands]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: false
      }),
      ContentCodeBlockExtension,
      ContentHeadingExtension,
      ContentTableOfContentsExtension,
      Placeholder.configure({
        placeholder: 'Type / for blocks, or start writing here.'
      }),
      LinkExtension.configure({
        openOnClick: false,
        autolink: true
      }),
      TaskList,
      TaskItem.configure({
        nested: true
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph']
      })
    ],
    editable: Boolean(currentVersion?.isCurrent && canEdit),
    content: normalizedContent?.body,
    editorProps: {
      attributes: {
        'data-content-editor': 'true'
      }
    }
  });

  useEffect(() => {
    if (!editor || !currentVersion || !page) {
      return;
    }

    const nextHydratedPayload =
      normalizedContent === null
        ? null
        : buildContentSaveInput({
            baseRevision:
              currentVersion.revision ?? currentRevisionRef.current ?? new Date().toISOString(),
            pageId: page.id,
            currentSlug: page.slug,
            title: normalizedContent.title,
            body: normalizedContent.body
          });
    const nextHydratedSnapshot =
      nextHydratedPayload === null ? null : buildContentSaveSnapshot(nextHydratedPayload);
    const pageChanged = lastHydratedPageIdRef.current !== page.id;
    const hasLocalDraft =
      latestDraftSnapshotRef.current !== null &&
      latestDraftSnapshotRef.current !== lastSavedSnapshotRef.current;
    const shouldHydrate =
      pageChanged ||
      (!hasLocalDraft &&
        inFlightSaveRef.current === null &&
        queuedSaveRef.current === null &&
        nextHydratedSnapshot !== null &&
        nextHydratedSnapshot !== lastSavedSnapshotRef.current);

    editor.setEditable(currentVersion.isCurrent && canEdit);

    if (!shouldHydrate) {
      return;
    }

    editor.commands.setContent(
      normalizedContent?.body ?? { type: 'doc', content: [{ type: 'paragraph' }] },
      { emitUpdate: false }
    );
    setTitleValue(normalizedContent?.title ?? page.title ?? '');
    setSlugValue(page.slug);
    setHasExplicitSlugOverride(false);
    setIsSlugEditorOpen(false);
    setIsConflictDialogOpen(false);
    setIsConflictComparisonLoading(false);
    setConflictLoadError(null);
    setConflictLocalPreview(null);
    setConflictServerPreview(null);
    setIsRestoreDraftDialogOpen(false);
    setRestoreDraftSavedAt(null);
    pendingRestoreDraftRef.current = null;
    lastHydratedPageIdRef.current = page.id;

    if (
      nextHydratedSnapshot !== null &&
      nextHydratedPayload !== null &&
      normalizedContent !== null
    ) {
      currentRevisionRef.current = currentVersion.revision ?? null;
      currentSlugRef.current = page.slug;
      lastSavedSnapshotRef.current = nextHydratedSnapshot;
      latestDraftPayloadRef.current = nextHydratedPayload;
      latestDraftSnapshotRef.current = nextHydratedSnapshot;
      lastSyncedPreviewRef.current = {
        title: normalizedContent.title,
        slug: page.slug,
        contentMarkdown: nextHydratedPayload.contentMarkdown,
        revision: currentVersion.revision ?? new Date().toISOString(),
        savedAt: currentVersion.createdAt
      };
    } else {
      currentRevisionRef.current = null;
      currentSlugRef.current = null;
      lastSavedSnapshotRef.current = null;
      latestDraftPayloadRef.current = null;
      latestDraftSnapshotRef.current = null;
      lastSyncedPreviewRef.current = null;
    }

    setSaveState('saved');
    setEditorRevision(0);

    const storedDraft = readStoredContentDraft(page.id);

    if (
      shouldRestoreStoredContentDraft({
        storedDraft,
        currentSnapshot: nextHydratedSnapshot
      }) &&
      storedDraft !== null
    ) {
      pendingRestoreDraftRef.current = storedDraft;
      setRestoreDraftSavedAt(storedDraft.savedAt);
      setIsRestoreDraftDialogOpen(true);
    }
  }, [canEdit, currentVersion, editor, normalizedContent, page]);

  useEffect(() => {
    const textarea = titleTextareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [titleValue]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleUpdate = () => {
      setEditorRevision((current) => current + 1);
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !canEdit || !currentVersion?.isCurrent) {
      setSlashMenu(null);
      return;
    }

    const updateSlashMenu = () => {
      const textBeforeCursor = getTextBeforeCursor(editor);

      if (textBeforeCursor === null) {
        setSlashMenu(null);
        return;
      }

      const match = getSlashCommandMatch(textBeforeCursor, editor.state.selection.from);

      if (!match) {
        setSlashMenu(null);
        return;
      }

      const filteredCommands = filterSlashCommandItems(match.query);

      if (filteredCommands.length === 0) {
        setSlashMenu((current) =>
          current
            ? {
                ...current,
                query: match.query,
                range: { from: match.from, to: match.to },
                selectedIndex: 0
              }
            : null
        );
        return;
      }

      const coords = editor.view.coordsAtPos(match.to);
      const placement = getSlashMenuPlacement(coords);

      setSlashMenu((current) => ({
        left: placement.left,
        top: placement.top,
        query: match.query,
        range: { from: match.from, to: match.to },
        selectedIndex: Math.min(current?.selectedIndex ?? 0, filteredCommands.length - 1)
      }));
    };

    const handleBlur = () => {
      window.setTimeout(() => {
        if (!editor.isFocused) {
          setSlashMenu(null);
          flushDraft();
        }
      }, 0);
    };

    updateSlashMenu();
    editor.on('update', updateSlashMenu);
    editor.on('selectionUpdate', updateSlashMenu);
    editor.on('focus', updateSlashMenu);
    editor.on('blur', handleBlur);

    return () => {
      editor.off('update', updateSlashMenu);
      editor.off('selectionUpdate', updateSlashMenu);
      editor.off('focus', updateSlashMenu);
      editor.off('blur', handleBlur);
    };
  }, [canEdit, currentVersion?.isCurrent, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const menu = slashMenuRef.current;
      const items = slashCommandsRef.current;

      if (!menu) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSlashMenu(null);
        return;
      }

      if (items.length === 0) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashMenu((current) =>
          current
            ? {
                ...current,
                selectedIndex: (current.selectedIndex + 1) % items.length
              }
            : current
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashMenu((current) =>
          current
            ? {
                ...current,
                selectedIndex: (current.selectedIndex - 1 + items.length) % items.length
              }
            : current
        );
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const selected = items[menu.selectedIndex] ?? items[0];

        if (!selected) {
          return;
        }

        executeSlashCommand(editor, selected.id, menu.range);
        setSlashMenu(null);
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener('keydown', handleKeyDown, true);

    return () => {
      dom.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !slashMenu) {
      return;
    }

    const updateSlashMenuPlacement = () => {
      const coords = editor.view.coordsAtPos(slashMenu.range.to);
      const placement = getSlashMenuPlacement(coords);

      setSlashMenu((current) =>
        current
          ? {
              ...current,
              left: placement.left,
              top: placement.top
            }
          : current
      );
    };

    window.addEventListener('scroll', updateSlashMenuPlacement, true);
    window.addEventListener('resize', updateSlashMenuPlacement);

    return () => {
      window.removeEventListener('scroll', updateSlashMenuPlacement, true);
      window.removeEventListener('resize', updateSlashMenuPlacement);
    };
  }, [editor, slashMenu]);

  useEffect(() => {
    if (!page || !editor || !onSave || !canEdit || !currentVersion?.isCurrent || isDeleting) {
      return;
    }

    const payload = buildContentSaveInput({
      baseRevision: currentRevisionRef.current || new Date().toISOString(),
      pageId: page.id,
      currentSlug: currentSlugRef.current || page.slug,
      slugValue: hasExplicitSlugOverride ? slugValue : undefined,
      title: titleValue,
      body: editor.getJSON() as import('./content-types').ContentDocNode
    });
    const snapshot = buildContentSaveSnapshot(payload);
    latestDraftPayloadRef.current = payload;
    latestDraftSnapshotRef.current = snapshot;

    if (snapshot === lastSavedSnapshotRef.current) {
      clearStoredContentDraft(page.id);
      clearScheduledSave();
      setSaveState((current) =>
        current === 'error' || current === 'conflict' ? current : 'saved'
      );
      return;
    }

    writeStoredContentDraft({
      pageId: page.id,
      title: titleValue,
      body: editor.getJSON() as import('./content-types').ContentDocNode,
      baseRevision: payload.baseRevision,
      currentSlug: payload.currentSlug,
      slugValue: hasExplicitSlugOverride ? slugValue : undefined,
      hasExplicitSlugOverride,
      snapshot,
      savedAt: new Date().toISOString()
    });

    if (saveState === 'conflict') {
      return;
    }

    if (
      inFlightSaveRef.current?.snapshot === snapshot ||
      queuedSaveRef.current?.snapshot === snapshot
    ) {
      setSaveState(inFlightSaveRef.current !== null ? 'saving' : 'pending');
      return;
    }

    setSaveState(inFlightSaveRef.current !== null ? 'saving' : 'pending');
    clearScheduledSave();
    saveTimeoutRef.current = window.setTimeout(() => {
      saveTimeoutRef.current = null;
      void performSave(payload, snapshot);
    }, CONTENT_AUTOSAVE_DELAY_MS);

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        latestDraftSnapshotRef.current === lastSavedSnapshotRef.current &&
        inFlightSaveRef.current === null
      ) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
      flushDraft({ keepalive: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushDraft({ keepalive: true });
      }
    };

    const handlePageHide = () => {
      flushDraft({ keepalive: true });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    canEdit,
    currentVersion?.isCurrent,
    editor,
    editorRevision,
    isDeleting,
    onSave,
    page,
    saveState,
    slugValue,
    titleValue
  ]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      flushDraft({ keepalive: true });
    };
  }, [page?.id]);

  const handleDelete = async () => {
    if (!page || !onDelete || !canDelete || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      'Delete this page and all child pages? This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      await onDelete(page);
    } catch (error) {
      setIsDeleting(false);
      toast.error('Failed to delete page', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    }
  };

  const handleCopyLocalDraft = async () => {
    const payload = latestDraftPayloadRef.current;

    if (!payload) {
      return;
    }

    await navigator.clipboard.writeText(payload.contentMarkdown);
    toast.success('Draft copied', {
      description: 'Your local markdown draft is now on the clipboard.'
    });
  };

  const handleRestoreStoredDraft = () => {
    if (!editor || !page) {
      return;
    }

    const storedDraft = pendingRestoreDraftRef.current;

    if (!storedDraft) {
      setIsRestoreDraftDialogOpen(false);
      setRestoreDraftSavedAt(null);
      return;
    }

    editor.commands.setContent(storedDraft.body, { emitUpdate: false });
    setTitleValue(storedDraft.title);
    setSlugValue(storedDraft.slugValue ?? (currentSlugRef.current || page.slug));
    setHasExplicitSlugOverride(
      storedDraft.hasExplicitSlugOverride && Boolean(storedDraft.slugValue)
    );
    setSaveState('pending');
    setEditorRevision((current) => current + 1);
    setIsRestoreDraftDialogOpen(false);
    setRestoreDraftSavedAt(null);
    pendingRestoreDraftRef.current = null;
  };

  const handleDismissStoredDraft = () => {
    if (page) {
      clearStoredContentDraft(page.id);
    }

    pendingRestoreDraftRef.current = null;
    setIsRestoreDraftDialogOpen(false);
    setRestoreDraftSavedAt(null);
  };

  const handleUseServerVersion = () => {
    if (!conflictServerPreview) {
      return;
    }

    applyServerPreview(conflictServerPreview);
  };

  const handleRestoreConflictLocalDraft = () => {
    if (!editor || !page || !conflictLocalPreview) {
      return;
    }

    const serverPreview = conflictServerPreview ?? lastSyncedPreviewRef.current;

    if (!serverPreview || !conflictLocalPreview.body) {
      return;
    }

    const normalizedServer = extractContentTitleAndBody(
      serverPreview.contentMarkdown,
      serverPreview.title
    );
    const serverPayload = buildContentSaveInput({
      baseRevision: serverPreview.revision,
      pageId: page.id,
      currentSlug: serverPreview.slug,
      title: normalizedServer.title,
      body: normalizedServer.body
    });

    currentRevisionRef.current = serverPreview.revision;
    currentSlugRef.current = serverPreview.slug;
    lastSavedSnapshotRef.current = buildContentSaveSnapshot(serverPayload);
    lastSyncedPreviewRef.current = serverPreview;

    editor.commands.setContent(conflictLocalPreview.body, { emitUpdate: false });
    setTitleValue(conflictLocalPreview.title);
    setSlugValue(conflictLocalPreview.slug);
    setHasExplicitSlugOverride(
      Boolean(
        conflictLocalPreview.hasExplicitSlugOverride &&
        conflictLocalPreview.slug !== serverPreview.slug
      )
    );
    setSaveState('pending');
    setEditorRevision((current) => current + 1);
    setIsConflictDialogOpen(false);
    setConflictLoadError(null);
  };

  const handleReviewConflict = () => {
    setIsConflictDialogOpen(true);
  };

  const conflictSummary = getConflictSummary(conflictLocalPreview, conflictServerPreview);
  const conflictDiffSegments = useMemo(
    () =>
      conflictLocalPreview && conflictServerPreview
        ? buildStructuredContentConflictDiff(
            conflictLocalPreview.contentMarkdown,
            conflictServerPreview.contentMarkdown
          )
        : [],
    [conflictLocalPreview, conflictServerPreview]
  );
  const conflictDiffSummary = useMemo(
    () => summarizeStructuredContentConflictDiff(conflictDiffSegments),
    [conflictDiffSegments]
  );

  if (!page || !currentVersion) {
    return (
      <div className="min-h-[calc(100svh-4rem)] bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--panel-subtle)/0.18)_100%)]">
        <div className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-[760px] items-center justify-center px-4 py-16 sm:px-6">
          <div className="w-full rounded-[28px] border border-border/70 bg-background/95 p-10 text-center shadow-[0_1px_0_hsl(var(--border)/0.7)]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--panel-subtle))] text-muted-foreground">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-foreground">
              {emptyStateTitle}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{emptyStateDescription}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--panel-subtle)/0.18)_100%)]">
      <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-4 sm:px-6 xl:px-10">
        <div className="mx-auto max-w-[900px]">
          <article className="overflow-hidden rounded-[24px] bg-background shadow-[0_1px_0_hsl(var(--border)/0.7)]">
            <div className="px-6 pb-10 pt-4 sm:px-12">
              <div className="flex items-start justify-between gap-4">
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {canEdit ? (
                    <span
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium',
                        saveState === 'error' || saveState === 'conflict'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      )}
                      aria-live="polite"
                    >
                      {saveState === 'saving' || saveState === 'pending' ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {saveState === 'saving' || saveState === 'pending'
                        ? 'Saving...'
                        : saveState === 'conflict'
                          ? 'Conflict detected'
                          : saveState === 'error'
                            ? 'Save failed'
                            : 'Saved'}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsFavorite((current) => !current)}
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                      isFavorite
                        ? 'text-amber-500 hover:bg-amber-500/10'
                        : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                    )}
                    aria-label={isFavorite ? 'Remove page from favorites' : 'Add page to favorites'}
                    aria-pressed={isFavorite}
                  >
                    <Star className={cn('h-4 w-4', isFavorite ? 'fill-current' : '')} />
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                        aria-label="More content actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Page actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setIsFavorite((current) => !current)}>
                        <Star className={cn(isFavorite ? 'fill-current text-amber-500' : '')} />
                        {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy />
                        Copy link
                      </DropdownMenuItem>
                      {canEdit ? (
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            setIsSlugEditorOpen(true);
                          }}
                        >
                          <CopyCheck />
                          Edit slug
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem>
                        <Share2 />
                        Share page
                      </DropdownMenuItem>
                      {canDelete ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => {
                              void handleDelete();
                            }}
                            disabled={isDeleting}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 />
                            {isDeleting ? 'Deleting page...' : 'Delete page'}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="mt-1">
                {saveState === 'conflict' ? (
                  <div className="mb-4 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      A newer version of this page was saved elsewhere.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Autosave is paused until you resolve the difference between your local draft
                      and the latest server version.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {conflictSummary.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {conflictSummary.map((item) => (
                            <span
                              key={item}
                              className="inline-flex items-center rounded-full bg-background px-2.5 py-1 text-[11px] font-medium text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)]"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleReviewConflict}
                        >
                          Review conflict
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void handleCopyLocalDraft();
                          }}
                        >
                          Copy local draft
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {breadcrumbs.length > 0 ? (
                  <nav
                    aria-label="Page breadcrumb"
                    className="mb-4 flex flex-wrap items-center gap-1 text-xs font-medium text-muted-foreground"
                  >
                    {breadcrumbs.map((crumb, index) => (
                      <span
                        key={`${crumb.label}-${index}`}
                        className="inline-flex items-center gap-1"
                      >
                        {index > 0 ? (
                          <ChevronRight className="h-3 w-3 text-muted-foreground/55" />
                        ) : null}
                        {crumb.href ? (
                          <Link
                            href={crumb.href}
                            className="transition-colors hover:text-foreground"
                          >
                            {crumb.label}
                          </Link>
                        ) : (
                          <span className="text-foreground">{crumb.label}</span>
                        )}
                      </span>
                    ))}
                  </nav>
                ) : null}
                <textarea
                  ref={titleTextareaRef}
                  value={titleValue}
                  onChange={(event) => setTitleValue(event.target.value)}
                  onBlur={() => {
                    flushDraft();
                  }}
                  rows={1}
                  spellCheck={false}
                  disabled={!canEdit}
                  className="field-sizing-content w-full resize-none overflow-hidden border-none bg-transparent p-0 text-4xl font-semibold tracking-[-0.055em] text-foreground outline-hidden placeholder:text-muted-foreground/55 sm:text-5xl"
                  placeholder="Untitled"
                  aria-label="Page title"
                />
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <div className="inline-flex items-center gap-2.5 rounded-full bg-muted/45 px-3 py-1.5">
                    <Avatar className="h-7 w-7 border border-border/60">
                      <AvatarImage
                        src={page.updatedByPhotoUrl ?? undefined}
                        alt={page.updatedByLabel}
                      />
                      <AvatarFallback className="bg-muted text-[10px] font-semibold">
                        {getAvatarInitials(page.updatedByLabel)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {page.updatedByLabel}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        Updated {currentVersion.createdAt}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="my-6 bg-border/60" />

              <Dialog open={isSlugEditorOpen} onOpenChange={setIsSlugEditorOpen}>
                <DialogContent className="sm:max-w-[480px]">
                  <DialogHeader>
                    <DialogTitle>Edit page slug</DialogTitle>
                    <DialogDescription>
                      Slugs stay stable while you write. Change this only when you want to update
                      the page URL explicitly.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Slug
                    </p>
                    <Input
                      value={slugValue}
                      onChange={(event) => setSlugValue(event.target.value)}
                      placeholder="launch-plan"
                      spellCheck={false}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSlugValue(currentSlugRef.current || page.slug);
                        setIsSlugEditorOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setHasExplicitSlugOverride(true);
                        setIsSlugEditorOpen(false);
                        flushDraft();
                      }}
                    >
                      Save slug
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog
                open={isRestoreDraftDialogOpen}
                onOpenChange={(open) => {
                  if (open) {
                    setIsRestoreDraftDialogOpen(true);
                    return;
                  }

                  handleDismissStoredDraft();
                }}
              >
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Restore local draft?</DialogTitle>
                    <DialogDescription>
                      A newer local draft was found for this page. Restoring it will replace the
                      current editor content with the last locally persisted version.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="rounded-2xl border border-border/70 bg-[hsl(var(--panel-subtle)/0.35)] px-4 py-3 text-sm text-muted-foreground">
                    {restoreDraftSavedAt
                      ? `Last local draft saved at ${formatConflictTimestamp(restoreDraftSavedAt)}.`
                      : 'A local draft is available for restore.'}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleDismissStoredDraft}>
                      Keep server version
                    </Button>
                    <Button type="button" onClick={handleRestoreStoredDraft}>
                      Restore draft
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog
                open={isConflictDialogOpen}
                onOpenChange={(open) => {
                  setIsConflictDialogOpen(open);
                }}
              >
                <DialogContent className="sm:max-w-[960px]">
                  <DialogHeader>
                    <DialogTitle>Resolve content conflict</DialogTitle>
                    <DialogDescription>
                      Review the latest server copy against your local draft, then choose which
                      version should continue in the editor.
                    </DialogDescription>
                  </DialogHeader>

                  <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList className="h-10 bg-muted/50">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="changes">Changes</TabsTrigger>
                      <TabsTrigger value="local">Local draft</TabsTrigger>
                      <TabsTrigger value="server">Latest server</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      {isConflictComparisonLoading ? (
                        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-[hsl(var(--panel-subtle)/0.35)] px-4 py-3 text-sm text-muted-foreground">
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Loading the latest server version...
                        </div>
                      ) : null}

                      {conflictLoadError ? (
                        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">
                          {conflictLoadError}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {conflictSummary.length > 0 ? (
                          conflictSummary.map((item) => (
                            <span
                              key={item}
                              className="inline-flex items-center rounded-full bg-[hsl(var(--panel-subtle)/0.5)] px-2.5 py-1 text-[11px] font-medium text-foreground"
                            >
                              {item}
                            </span>
                          ))
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[hsl(var(--panel-subtle)/0.5)] px-2.5 py-1 text-[11px] font-medium text-foreground">
                            Differences are still loading
                          </span>
                        )}
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-[20px] border border-border/70 bg-[hsl(var(--panel-subtle)/0.18)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                Local draft
                              </p>
                              <p className="mt-1 text-base font-semibold text-foreground">
                                {conflictLocalPreview?.title ?? 'Loading draft'}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {conflictLocalPreview
                                ? formatConflictTimestamp(conflictLocalPreview.savedAt)
                                : 'Waiting'}
                            </span>
                          </div>
                          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em]">
                                Slug
                              </p>
                              <p className="mt-1 rounded-xl bg-background px-3 py-2 font-mono text-xs text-foreground">
                                {conflictLocalPreview?.slug ?? 'Loading'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em]">
                                Preview
                              </p>
                              <pre className="mt-1 max-h-[220px] overflow-auto rounded-xl bg-background px-3 py-3 font-mono text-xs leading-5 text-foreground whitespace-pre-wrap">
                                {conflictLocalPreview
                                  ? getConflictPreviewExcerpt(conflictLocalPreview.contentMarkdown)
                                  : 'Loading local draft...'}
                              </pre>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-border/70 bg-[hsl(var(--panel-subtle)/0.18)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                Latest server
                              </p>
                              <p className="mt-1 text-base font-semibold text-foreground">
                                {conflictServerPreview?.title ?? 'Loading latest version'}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {conflictServerPreview
                                ? formatConflictTimestamp(conflictServerPreview.savedAt)
                                : 'Waiting'}
                            </span>
                          </div>
                          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em]">
                                Slug
                              </p>
                              <p className="mt-1 rounded-xl bg-background px-3 py-2 font-mono text-xs text-foreground">
                                {conflictServerPreview?.slug ?? 'Loading'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em]">
                                Preview
                              </p>
                              <pre className="mt-1 max-h-[220px] overflow-auto rounded-xl bg-background px-3 py-3 font-mono text-xs leading-5 text-foreground whitespace-pre-wrap">
                                {conflictServerPreview
                                  ? getConflictPreviewExcerpt(conflictServerPreview.contentMarkdown)
                                  : 'Loading latest server version...'}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="changes" className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-border/70 bg-[hsl(var(--panel-subtle)/0.18)] px-4 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            Changed blocks
                          </p>
                          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                            {conflictDiffSummary.changedBlocks}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700">
                            Local-only lines
                          </p>
                          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                            {conflictDiffSummary.addedLines}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700">
                            Server-only lines
                          </p>
                          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                            {conflictDiffSummary.removedLines}
                          </p>
                        </div>
                      </div>

                      <div className="max-h-[420px] overflow-auto rounded-2xl border border-border/70 bg-[hsl(var(--panel-subtle)/0.18)] p-3">
                        {conflictDiffSegments.length > 0 ? (
                          <div className="space-y-3">
                            {conflictDiffSegments.map((segment, index) => (
                              <div
                                key={`${segment.kind}-${index}`}
                                className={cn(
                                  'rounded-xl border px-3 py-3',
                                  segment.kind === 'added'
                                    ? 'border-emerald-500/25 bg-emerald-500/5'
                                    : segment.kind === 'removed'
                                      ? 'border-amber-500/25 bg-amber-500/5'
                                      : 'border-border/60 bg-background'
                                )}
                              >
                                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                  {segment.kind === 'added'
                                    ? 'Local draft'
                                    : segment.kind === 'removed'
                                      ? 'Latest server'
                                      : 'Unchanged'}
                                </p>
                                <pre className="overflow-auto font-mono text-xs leading-5 text-foreground whitespace-pre-wrap">
                                  {segment.lines.join('\n')}
                                </pre>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl bg-background px-4 py-6 text-sm text-muted-foreground">
                            Structured changes will appear once both versions are loaded.
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="local">
                      <pre className="max-h-[420px] overflow-auto rounded-2xl border border-border/70 bg-[hsl(var(--panel-subtle)/0.18)] px-4 py-4 font-mono text-xs leading-5 text-foreground whitespace-pre-wrap">
                        {conflictLocalPreview
                          ? conflictLocalPreview.contentMarkdown
                          : 'Loading local draft...'}
                      </pre>
                    </TabsContent>

                    <TabsContent value="server">
                      <pre className="max-h-[420px] overflow-auto rounded-2xl border border-border/70 bg-[hsl(var(--panel-subtle)/0.18)] px-4 py-4 font-mono text-xs leading-5 text-foreground whitespace-pre-wrap">
                        {conflictServerPreview
                          ? conflictServerPreview.contentMarkdown
                          : 'Loading latest server version...'}
                      </pre>
                    </TabsContent>
                  </Tabs>

                  <DialogFooter className="gap-2 sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void handleCopyLocalDraft();
                        }}
                      >
                        Copy local draft
                      </Button>
                      <Button type="button" variant="outline" onClick={handleUseServerVersion}>
                        Keep server version
                      </Button>
                    </div>
                    <Button
                      type="button"
                      onClick={handleRestoreConflictLocalDraft}
                      disabled={
                        conflictLocalPreview === null ||
                        conflictServerPreview === null ||
                        isConflictComparisonLoading
                      }
                    >
                      Restore local draft
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {editor ? (
                <div className="mb-4">
                  <EditorToolbar canEdit={currentVersion.isCurrent && canEdit} editor={editor} />
                </div>
              ) : null}

              <div className="relative">
                {editor ? (
                  <EditorContent
                    editor={editor}
                    className="group/content-editor min-h-[760px] [&_.ProseMirror]:min-h-[760px] [&_.ProseMirror]:outline-hidden [&_.ProseMirror]:text-[16px] [&_.ProseMirror]:leading-8 [&_.ProseMirror_blockquote]:border-l [&_.ProseMirror_blockquote]:border-border/80 [&_.ProseMirror_blockquote]:pl-5 [&_.ProseMirror_blockquote]:text-muted-foreground [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-foreground/6 [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_h1]:mt-2 [&_.ProseMirror_h1]:text-4xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:tracking-[-0.055em] [&_.ProseMirror_h2]:mt-10 [&_.ProseMirror_h2]:text-2xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:tracking-[-0.04em] [&_.ProseMirror_h3]:mt-8 [&_.ProseMirror_h3]:text-xl [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h4]:mt-6 [&_.ProseMirror_h4]:text-base [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_h4]:tracking-[-0.02em] [&_.ProseMirror_li]:my-1.5 [&_.ProseMirror_p]:relative [&_.ProseMirror_p]:my-4 [&_.ProseMirror_p:hover]:before:absolute [&_.ProseMirror_p:hover]:before:left-[-28px] [&_.ProseMirror_p:hover]:before:top-[2px] [&_.ProseMirror_p:hover]:before:text-[12px] [&_.ProseMirror_p:hover]:before:text-muted-foreground/55 [&_.ProseMirror_p:hover]:before:content-['+'] [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-2xl [&_.ProseMirror_pre]:bg-slate-950 [&_.ProseMirror_pre]:p-4 [&_.ProseMirror_pre]:text-slate-100 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_span[data-size='small']]:text-[13px] [&_.ProseMirror_span[data-size='small']]:leading-6 [&_.ProseMirror_ul[data-type='taskList']]:my-3 [&_.ProseMirror_ul[data-type='taskList']]:list-none [&_.ProseMirror_ul[data-type='taskList']]:space-y-1 [&_.ProseMirror_ul[data-type='taskList']]:pl-0 [&_.ProseMirror_ul[data-type='taskList']_li]:my-0 [&_.ProseMirror_ul[data-type='taskList']_li]:flex [&_.ProseMirror_ul[data-type='taskList']_li]:items-start [&_.ProseMirror_ul[data-type='taskList']_li]:gap-2.5 [&_.ProseMirror_ul[data-type='taskList']_li>label]:flex [&_.ProseMirror_ul[data-type='taskList']_li>label]:h-7 [&_.ProseMirror_ul[data-type='taskList']_li>label]:items-center [&_.ProseMirror_ul[data-type='taskList']_li>label]:shrink-0 [&_.ProseMirror_ul[data-type='taskList']_li>label>input]:m-0 [&_.ProseMirror_ul[data-type='taskList']_li>div]:min-w-0 [&_.ProseMirror_ul[data-type='taskList']_li>div]:flex-1 [&_.ProseMirror_ul[data-type='taskList']_li>div>p]:my-0 [&_.ProseMirror_ul[data-type='taskList']_li>div>p]:leading-7 [&_.ProseMirror_ul[data-type='taskList']_li>div>p:hover]:before:content-none [&_.ProseMirror_.is-empty]:before:pointer-events-none [&_.ProseMirror_.is-empty]:before:float-left [&_.ProseMirror_.is-empty]:before:h-0 [&_.ProseMirror_.is-empty]:before:text-muted-foreground [&_.ProseMirror_.is-empty]:before:content-[attr(data-placeholder)]"
                  />
                ) : null}

                {editor && slashMenu ? (
                  <div
                    data-content-slash-menu="true"
                    className="fixed z-50 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/70 bg-background/98 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur-sm"
                    style={{ left: slashMenu.left, top: slashMenu.top }}
                  >
                    <div className="border-b border-border/60 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Type / for blocks
                    </div>
                    <div className="max-h-[320px] overflow-y-auto p-1.5">
                      {slashCommands.length > 0 ? (
                        slashCommands.map((command, index) => {
                          const Icon = SLASH_COMMAND_ICONS[command.id];

                          return (
                            <button
                              key={command.id}
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                              }}
                              onClick={() => {
                                executeSlashCommand(editor, command.id, slashMenu.range);
                                setSlashMenu(null);
                              }}
                              className={cn(
                                'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                                index === slashMenu.selectedIndex
                                  ? 'bg-foreground/6 text-foreground'
                                  : 'text-foreground hover:bg-foreground/4'
                              )}
                            >
                              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--panel-subtle))] text-muted-foreground">
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">{command.label}</span>
                                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                                  {command.description}
                                </span>
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-4 text-sm text-muted-foreground">
                          No blocks match “{slashMenu.query}”.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

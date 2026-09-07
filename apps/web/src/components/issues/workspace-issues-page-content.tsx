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
  AlertCircle,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDotDashed,
  LoaderCircle,
  ListFilter,
  MessageSquareMore,
  Plus,
  RotateCcw,
  Save,
  Search,
  X
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  buildIssueAssigneeOptions,
  getAssigneeSummary,
  getIssueStatusIcon,
  IssueAssigneeMenuAlign,
  InlineAssigneeEditor,
  InlineIssueDeliveryEditor,
  InlinePriorityEditor,
  InlineStatusEditor
} from './issue-inline-editors';

import type { ProjectIssuePreview } from '~/lib/issues/issue-preview-data';
import type {
  IssueActivity,
  IssueComment,
  IssueDetail,
  IssueLabel,
  IssueListItem,
  UpdateIssueInput
} from '~/types/issue.types';
import type { Project, ProjectMember } from '~/types/project.types';

import { ContentCodeBlockExtension } from '~/components/content/content-code-block-node';
import { ContentHeadingExtension } from '~/components/content/content-heading-extension';
import { IssueActionsMenu } from '~/components/issues/issue-actions-menu';
import { CompactIssueConversationTabs } from '~/components/issues/issue-conversation';
import { IssueCreateDialog } from '~/components/issues/issue-create-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Separator } from '~/components/ui/separator';
import { WorkspaceStat, WorkspaceStatSize } from '~/components/ui/workspace-stat';
import { useProjectContext } from '~/contexts/project-context';
import { issuesApi } from '~/lib/api/issues-api';
import { orderIssueActivityDesc, orderIssueCommentsDesc } from '~/lib/issues/issue-feed-order';
import {
  buildInlineIssueMutation,
  canApplyInlineIssueUpdate
} from '~/lib/issues/issue-inline-editing';
import { mapIssueToPreview, mapIssueToWorkspaceRecord } from '~/lib/issues/issue-view-models';
import {
  deleteSavedIssueView,
  readSavedIssueViews,
  type SavedIssueView,
  upsertSavedIssueView
} from '~/lib/issues/saved-issue-views';
import {
  parseMarkdownToContentDoc,
  serializeContentDocToMarkdown
} from '~/lib/projects/project-content-markdown';
import {
  getPostCreateProjectIssuesQueryState,
  getProjectIssuesSavedViewState,
  getSynchronizedProjectIssuesQueryState,
  parseProjectIssuesQueryParams,
  ProjectIssuesFilter,
  type ProjectIssuesQueryState,
  ProjectIssuesProjectScope,
  toProjectIssuesSearchParams
} from '~/lib/projects/project-issues-query-params';
import { cn } from '~/lib/utils';

export interface WorkspaceIssueRecord {
  issue: ProjectIssuePreview;
  labels: IssueLabel[];
  members: ProjectMember[];
  project: Project;
  searchText: string;
  sourceIssue: IssueListItem | IssueDetail;
}

function getLabelClass(label: string): string {
  if (label === 'Frontend' || label === 'Filters') {
    return 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
  }

  if (label === 'Dependencies' || label === 'Accessibility') {
    return 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300';
  }

  if (label === 'Workflow' || label === 'Planning') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }

  if (label === 'Docs') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }

  return 'border-border/70 bg-muted/30 text-muted-foreground';
}

function WorkspaceIssueLabelChips({ labels }: { labels: IssueLabel[] }) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <div className="hidden flex-wrap gap-1.5 md:flex">
      {labels.map((label) => (
        <Badge
          key={label.id}
          size="sm"
          variant="outline"
          className="rounded-full px-2 py-0.5 text-[10px]"
          style={
            label.color
              ? {
                  borderColor: label.color,
                  color: label.color
                }
              : undefined
          }
        >
          {label.color ? (
            <span
              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: label.color }}
            />
          ) : null}
          {label.name}
        </Badge>
      ))}
    </div>
  );
}

function WorkspaceIssueLabelBadge({
  label,
  onRemove
}: {
  label: IssueLabel;
  onRemove?: (() => void) | undefined;
}) {
  return (
    <Badge
      size="sm"
      variant="outline"
      className="rounded-full px-2 py-0.5 text-[11px]"
      style={
        label.color
          ? {
              borderColor: label.color,
              color: label.color
            }
          : undefined
      }
    >
      {label.color ? (
        <span
          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: label.color }}
        />
      ) : null}
      {label.name}
      {onRemove ? (
        <button
          type="button"
          className="ml-1 inline-flex items-center text-current/70 hover:text-current"
          onClick={onRemove}
          aria-label={`Remove ${label.name} label`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </Badge>
  );
}

function getProjectBadgeLabel(project: Project): string {
  return project.key?.trim() || 'ORG';
}

function getProjectBadgeAccessibleLabel(project: Project): string {
  return `Project ${getProjectBadgeLabel(project)}: ${project.name}`;
}

function toWorkspaceSubtaskStatusValue(
  stage: ProjectIssuePreview['stage']
): IssueListItem['status'] {
  return stage;
}

function toWorkspaceSubtaskPriorityValue(
  priorityLabel: ProjectIssuePreview['priorityLabel']
): IssueListItem['priority'] {
  if (priorityLabel === 'Urgent') {
    return 'urgent';
  }

  if (priorityLabel === 'High') {
    return 'high';
  }

  if (priorityLabel === 'Medium') {
    return 'medium';
  }

  return 'low';
}

function applyPreviewToWorkspaceSubtask(
  subtask: IssueListItem,
  preview: ProjectIssuePreview
): IssueListItem {
  return {
    ...subtask,
    status: toWorkspaceSubtaskStatusValue(preview.stage),
    priority: toWorkspaceSubtaskPriorityValue(preview.priorityLabel),
    assignees: preview.assignees.map((assignee) => ({
      userId: assignee.userId,
      displayName: assignee.name,
      photoUrl: assignee.avatarUrl
    }))
  };
}

function isIssueDetailRecord(
  sourceIssue: WorkspaceIssueRecord['sourceIssue']
): sourceIssue is IssueDetail {
  return 'comments' in sourceIssue && Array.isArray(sourceIssue.comments);
}

function matchesFilter(
  issue: ProjectIssuePreview,
  filter: ProjectIssuesFilter,
  currentUserLabel: string
) {
  if (filter === ProjectIssuesFilter.ALL) {
    return true;
  }

  if (filter === ProjectIssuesFilter.ACTIVE) {
    return issue.stage === 'in_progress';
  }

  if (filter === ProjectIssuesFilter.BACKLOG) {
    return issue.stage === 'backlog';
  }

  if (filter === ProjectIssuesFilter.BLOCKED) {
    return issue.stage === 'blocked';
  }

  if (filter === ProjectIssuesFilter.DONE) {
    return issue.stage === 'done';
  }

  return issue.assignees.some((assignee) => assignee.name === currentUserLabel);
}

const compactSelectTriggerClassName =
  'h-8 min-h-8 rounded-md border-border/70 bg-background px-2.5 text-xs shadow-none';
const compactSecondaryButtonClassName =
  'h-8 rounded-md border-border/70 px-2.5 text-xs font-medium shadow-none';

function WorkspaceIssueDescriptionEditor({
  canEdit,
  descriptionMarkdown,
  onSave
}: {
  canEdit: boolean;
  descriptionMarkdown: string;
  onSave: (nextDescriptionMarkdown: string) => Promise<void>;
}) {
  const deferredDescriptionMarkdown = useDeferredValue(descriptionMarkdown);
  const [isSaving, setIsSaving] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: false
      }),
      ContentCodeBlockExtension,
      ContentHeadingExtension,
      Placeholder.configure({
        placeholder: 'Type / for blocks, or start writing issue context.'
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
    editable: canEdit,
    content: parseMarkdownToContentDoc(deferredDescriptionMarkdown),
    editorProps: {
      attributes: {
        'data-issue-description-editor': 'true'
      }
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(canEdit);

    if (!editor.isFocused) {
      editor.commands.setContent(parseMarkdownToContentDoc(deferredDescriptionMarkdown), {
        emitUpdate: false
      });
    }
  }, [canEdit, deferredDescriptionMarkdown, editor]);

  const handleBlur = async () => {
    if (!editor || !canEdit || isSaving) {
      return;
    }

    const nextDescriptionMarkdown = serializeContentDocToMarkdown(editor.getJSON()).trim();
    const currentDescriptionMarkdown = descriptionMarkdown.trim();

    if (nextDescriptionMarkdown === currentDescriptionMarkdown) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave(nextDescriptionMarkdown);
    } catch {
      return;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Description
        </p>
        {isSaving ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <LoaderCircle className="h-3 w-3 animate-spin" />
            Saving
          </span>
        ) : null}
      </div>
      <div className="rounded-lg border border-border/60 bg-background/80 px-2.5 py-2">
        {editor ? (
          <EditorContent
            editor={editor}
            onBlurCapture={() => {
              void handleBlur();
            }}
            className="min-h-[108px] [&_.ProseMirror]:min-h-[92px] [&_.ProseMirror]:outline-hidden [&_.ProseMirror]:text-[12.5px] [&_.ProseMirror]:leading-5 [&_.ProseMirror_a]:text-foreground [&_.ProseMirror_a]:underline [&_.ProseMirror_blockquote]:border-l [&_.ProseMirror_blockquote]:border-border/80 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-muted-foreground [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-foreground/6 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_h1]:text-lg [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:text-sm [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h4]:text-sm [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_li]:my-0.5 [&_.ProseMirror_p]:my-1 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-xl [&_.ProseMirror_pre]:bg-slate-950 [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:text-slate-100 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ul[data-type='taskList']]:my-2 [&_.ProseMirror_ul[data-type='taskList']]:list-none [&_.ProseMirror_ul[data-type='taskList']]:space-y-1 [&_.ProseMirror_ul[data-type='taskList']]:pl-0 [&_.ProseMirror_ul[data-type='taskList']_li]:my-0 [&_.ProseMirror_ul[data-type='taskList']_li]:flex [&_.ProseMirror_ul[data-type='taskList']_li]:items-start [&_.ProseMirror_ul[data-type='taskList']_li]:gap-2 [&_.ProseMirror_ul[data-type='taskList']_li>label]:flex [&_.ProseMirror_ul[data-type='taskList']_li>label]:h-5 [&_.ProseMirror_ul[data-type='taskList']_li>label]:items-center [&_.ProseMirror_ul[data-type='taskList']_li>label]:shrink-0 [&_.ProseMirror_ul[data-type='taskList']_li>label>input]:m-0 [&_.ProseMirror_ul[data-type='taskList']_li>div]:min-w-0 [&_.ProseMirror_ul[data-type='taskList']_li>div]:flex-1 [&_.ProseMirror_ul[data-type='taskList']_li>div>p]:my-0 [&_.ProseMirror_ul[data-type='taskList']_li>div>p]:leading-5 [&_.ProseMirror_.is-empty]:before:pointer-events-none [&_.ProseMirror_.is-empty]:before:float-left [&_.ProseMirror_.is-empty]:before:h-0 [&_.ProseMirror_.is-empty]:before:text-muted-foreground [&_.ProseMirror_.is-empty]:before:content-[attr(data-placeholder)]"
          />
        ) : null}
      </div>
    </div>
  );
}

function WorkspaceIssueConversationTabs({
  activity,
  canCreateComment,
  commentDraft,
  comments,
  isCreatingComment,
  onCommentDraftChange,
  onCreateComment
}: {
  activity: IssueActivity[];
  canCreateComment: boolean;
  commentDraft: string;
  comments: IssueComment[];
  isCreatingComment: boolean;
  onCommentDraftChange: (value: string) => void;
  onCreateComment: () => void;
}) {
  return (
    <CompactIssueConversationTabs
      activity={activity}
      canCreateComment={canCreateComment}
      commentDraft={commentDraft}
      comments={comments}
      isCreatingComment={isCreatingComment}
      onCommentDraftChange={onCommentDraftChange}
      onCreateComment={onCreateComment}
    />
  );
}

function WorkspaceIssueSubtaskRow({
  canUpdateIssue,
  currentUserId,
  getIssueHref,
  members,
  onUpdateSubtask,
  project,
  subtask
}: {
  canUpdateIssue: boolean;
  currentUserId?: number;
  getIssueHref: (issueId: string) => string;
  members: ProjectMember[];
  onUpdateSubtask: (
    issueId: string,
    updater: (issue: ProjectIssuePreview) => ProjectIssuePreview
  ) => void;
  project: Project;
  subtask: IssueListItem;
}) {
  const subtaskPreview = mapIssueToPreview(subtask, {
    members,
    projectLookup: new Map([[project.id, project]])
  });
  const subtaskAssigneeOptions = buildIssueAssigneeOptions(members, subtaskPreview.assignees);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/5 px-2.5 py-1.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={cn(
            'h-3.5 w-3.5 shrink-0 rounded-full border',
            subtask.status === 'done'
              ? 'border-emerald-500 bg-emerald-500'
              : 'border-border/70 bg-background'
          )}
        />
        <Link
          href={getIssueHref(String(subtask.id))}
          className={cn(
            'min-w-0 truncate text-[12.5px] hover:underline',
            subtask.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'
          )}
        >
          {subtask.title}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        <InlineStatusEditor
          compact
          issue={subtaskPreview}
          onUpdate={onUpdateSubtask}
          disabled={!canUpdateIssue}
        />
        <InlinePriorityEditor
          compact
          issue={subtaskPreview}
          onUpdate={onUpdateSubtask}
          disabled={!canUpdateIssue}
        />
        <InlineAssigneeEditor
          canManageAssignees={canUpdateIssue}
          currentUserId={currentUserId}
          issue={subtaskPreview}
          onUpdate={onUpdateSubtask}
          options={subtaskAssigneeOptions}
        />
      </div>
    </div>
  );
}

function WorkspaceIssueSubtasksSection({
  canCreateSubtask,
  canUpdateIssue,
  currentUserId,
  getIssueHref,
  isCreatingSubtask,
  members,
  onCreateSubtask,
  onSubtaskDraftChange,
  onUpdateSubtask,
  project,
  subtaskDraft,
  subtasks
}: {
  canCreateSubtask: boolean;
  canUpdateIssue: boolean;
  currentUserId?: number;
  getIssueHref: (issueId: string) => string;
  isCreatingSubtask: boolean;
  members: ProjectMember[];
  onCreateSubtask: () => void;
  onSubtaskDraftChange: (value: string) => void;
  onUpdateSubtask: (
    issueId: string,
    updater: (issue: ProjectIssuePreview) => ProjectIssuePreview
  ) => void;
  project: Project;
  subtaskDraft: string;
  subtasks: IssueListItem[];
}) {
  const completedCount = subtasks.filter((subtask) => subtask.status === 'done').length;
  const progressValue = subtasks.length > 0 ? (completedCount / subtasks.length) * 100 : 0;

  return (
    <section className="rounded-lg border border-border/60 bg-background p-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-foreground">Subtasks</p>
          <p className="text-[11px] text-muted-foreground">
            {completedCount} of {subtasks.length} complete
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">{Math.round(progressValue)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progressValue}%` }}
        />
      </div>

      <div className="mt-2.5 space-y-1.5">
        {subtasks.map((subtask) => (
          <WorkspaceIssueSubtaskRow
            key={subtask.id}
            canUpdateIssue={canUpdateIssue}
            currentUserId={currentUserId}
            getIssueHref={getIssueHref}
            members={members}
            onUpdateSubtask={onUpdateSubtask}
            project={project}
            subtask={subtask}
          />
        ))}
        {subtasks.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No subtasks yet.</p>
        ) : null}
      </div>

      <div className="mt-2.5 rounded-lg border border-dashed border-border/60 bg-muted/5 px-2.5 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Create subtask
        </p>
        <div className="mt-2 flex gap-2">
          <Input
            placeholder="Write a subtask title"
            className="h-8 text-[12px]"
            value={subtaskDraft}
            onChange={(event) => onSubtaskDraftChange(event.target.value)}
            disabled={!canCreateSubtask || isCreatingSubtask}
          />
          <Button
            type="button"
            size="sm"
            className="h-8 px-2.5 text-[11px]"
            onClick={onCreateSubtask}
            disabled={!canCreateSubtask || subtaskDraft.trim().length === 0 || isCreatingSubtask}
          >
            Add
          </Button>
        </div>
      </div>
    </section>
  );
}

function WorkspaceIssueDetailsPanel({
  availableLabels,
  canCreateIssues = false,
  canDeleteIssues = false,
  canUpdateIssues = false,
  canCreateComment = false,
  currentUserId,
  deletingIssueId = null,
  isCreatingComment = false,
  isCreatingSubtask = false,
  isLoadingDetail = false,
  issueActivity = [],
  issueComments = [],
  issueSubtasks = [],
  onAddLabel,
  onCommentDraftChange,
  onCreateLabel,
  onCreateComment,
  onCreateSubtask,
  onDeleteIssue,
  onEnsureIssueDetail,
  onIssueHref,
  onPersistIssue,
  onRemoveLabel,
  onSubtaskDraftChange,
  onUpdateSubtask,
  onUpdate,
  commentDraft,
  subtaskDraft,
  record
}: {
  availableLabels: IssueLabel[];
  canCreateIssues?: boolean;
  canDeleteIssues?: boolean;
  canUpdateIssues?: boolean;
  canCreateComment?: boolean;
  currentUserId?: number;
  deletingIssueId?: string | null;
  isCreatingComment?: boolean;
  isCreatingSubtask?: boolean;
  isLoadingDetail?: boolean;
  issueActivity?: IssueActivity[];
  issueComments?: IssueComment[];
  issueSubtasks?: IssueListItem[];
  onAddLabel: (issueId: string, labelId: number) => Promise<void>;
  onCommentDraftChange: (value: string) => void;
  onCreateLabel: (issueId: string, input: { color: string; name: string }) => Promise<void>;
  onCreateComment: (issueId: string) => Promise<void>;
  onCreateSubtask: (issueId: string) => Promise<void>;
  onDeleteIssue: (issueId: string) => Promise<void>;
  onEnsureIssueDetail: (issueId: string) => void;
  onIssueHref: (issueId: string) => string;
  onPersistIssue: (issueId: string, input: UpdateIssueInput) => Promise<void>;
  onRemoveLabel: (issueId: string, labelId: number) => Promise<void>;
  onSubtaskDraftChange: (value: string) => void;
  onUpdateSubtask: (
    parentIssueId: string,
    issueId: string,
    updater: (issue: ProjectIssuePreview) => ProjectIssuePreview
  ) => void;
  onUpdate: (issueId: string, updater: (issue: ProjectIssuePreview) => ProjectIssuePreview) => void;
  commentDraft: string;
  subtaskDraft: string;
  record: WorkspaceIssueRecord | null;
}) {
  const [titleValue, setTitleValue] = useState(record?.sourceIssue.title ?? '');
  const [isLabelComposerOpen, setIsLabelComposerOpen] = useState(false);
  const [labelQuery, setLabelQuery] = useState('');
  const [labelDraftColor, setLabelDraftColor] = useState('#94a3b8');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isUpdatingLabels, setIsUpdatingLabels] = useState(false);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const issueId = record?.issue.id ?? null;
  const sourceIssue = record?.sourceIssue ?? null;
  const addableLabels = availableLabels.filter(
    (label) => !record?.labels.some((current) => current.id === label.id)
  );
  const normalizedLabelQuery = labelQuery.trim().toLowerCase();
  const filteredAddableLabels = addableLabels.filter((label) =>
    label.name.toLowerCase().includes(normalizedLabelQuery)
  );
  const hasMatchingLabel = addableLabels.some(
    (label) => label.name.trim().toLowerCase() === normalizedLabelQuery
  );

  useEffect(() => {
    setTitleValue(record?.sourceIssue.title ?? '');
    setIsLabelComposerOpen(false);
    setLabelQuery('');
  }, [issueId, record?.sourceIssue.title]);

  useEffect(() => {
    if (!record || isIssueDetailRecord(record.sourceIssue)) {
      return;
    }

    onEnsureIssueDetail(record.issue.id);
  }, [onEnsureIssueDetail, record]);

  useEffect(() => {
    const textarea = titleTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [titleValue]);

  const handleTitleBlur = async () => {
    const nextTitle = titleValue.trim();
    if (!record || !sourceIssue || !canUpdateIssues || isSavingTitle) {
      return;
    }

    if (nextTitle.length === 0) {
      setTitleValue(sourceIssue.title);
      return;
    }

    if (nextTitle === sourceIssue.title) {
      return;
    }

    setIsSavingTitle(true);
    try {
      await onPersistIssue(record.issue.id, { title: nextTitle });
    } catch {
      setTitleValue(sourceIssue.title);
      return;
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleRemoveLabel = async (labelId: number) => {
    if (!record || !canUpdateIssues || isUpdatingLabels) {
      return;
    }

    setIsUpdatingLabels(true);
    try {
      await onRemoveLabel(record.issue.id, labelId);
    } catch {
      return;
    } finally {
      setIsUpdatingLabels(false);
    }
  };

  const handleCreateLabel = async () => {
    if (!record || !canUpdateIssues || isUpdatingLabels || labelQuery.trim().length === 0) {
      return;
    }

    setIsUpdatingLabels(true);
    try {
      await onCreateLabel(record.issue.id, {
        color: labelDraftColor,
        name: labelQuery.trim()
      });
      setLabelQuery('');
      setIsLabelComposerOpen(false);
    } catch {
      return;
    } finally {
      setIsUpdatingLabels(false);
    }
  };

  if (!record || !sourceIssue) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Choose an issue from the list to review details.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
        <div className="space-y-2.5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Badge
                variant="outline"
                className="rounded-full px-2 py-0.5 text-[10px]"
                title={record.project.name}
                aria-label={getProjectBadgeAccessibleLabel(record.project)}
              >
                {getProjectBadgeLabel(record.project)}
              </Badge>
              <Link
                href={onIssueHref(record.issue.id)}
                className="font-mono uppercase tracking-[0.18em] underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {record.issue.identifier}
              </Link>
              <IssueActionsMenu
                align="start"
                canDeleteIssue={canDeleteIssues}
                issueHref={onIssueHref(record.issue.id)}
                issueIdentifier={record.issue.identifier}
                issueTitle={record.issue.title}
                isDeleting={deletingIssueId === record.issue.id}
                onDeleteIssue={() => onDeleteIssue(record.issue.id)}
                openLabel="Open full page"
                triggerLabel="Open sidebar issue actions"
                variant="sidebar-header"
              />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <textarea
                  ref={titleTextareaRef}
                  value={titleValue}
                  onChange={(event) => setTitleValue(event.target.value)}
                  onBlur={() => {
                    void handleTitleBlur();
                  }}
                  rows={1}
                  spellCheck={false}
                  disabled={!canUpdateIssues}
                  className="field-sizing-content w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[19px] font-semibold leading-tight tracking-[-0.04em] text-foreground outline-hidden placeholder:text-muted-foreground/50"
                  placeholder="Untitled issue"
                  aria-label="Issue title"
                />
                {isSavingTitle ? (
                  <LoaderCircle className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <InlineStatusEditor
                  issue={record.issue}
                  onUpdate={onUpdate}
                  disabled={!canUpdateIssues}
                />
                <InlinePriorityEditor
                  issue={record.issue}
                  onUpdate={onUpdate}
                  disabled={!canUpdateIssues}
                />
                <InlineAssigneeEditor
                  canManageAssignees={canUpdateIssues}
                  currentUserId={currentUserId}
                  issue={record.issue}
                  onUpdate={onUpdate}
                  options={buildIssueAssigneeOptions(record.members, record.issue.assignees)}
                  showLabel
                />
              </div>
            </div>
          </div>

          <Separator className="bg-border/60" />

          <WorkspaceIssueDescriptionEditor
            canEdit={canUpdateIssues}
            descriptionMarkdown={record.sourceIssue.descriptionMarkdown}
            onSave={(nextDescriptionMarkdown) =>
              onPersistIssue(record.issue.id, { descriptionMarkdown: nextDescriptionMarkdown })
            }
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Labels
              </p>
              {isUpdatingLabels ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                  Saving
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {record.labels.length > 0 ? (
                record.labels.map((label) => (
                  <WorkspaceIssueLabelBadge
                    key={label.id}
                    label={label}
                    onRemove={canUpdateIssues ? () => void handleRemoveLabel(label.id) : undefined}
                  />
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No labels yet.</span>
              )}
              {canUpdateIssues ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
                  onClick={() => {
                    setIsLabelComposerOpen((current) => !current);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Add label
                </button>
              ) : null}
            </div>
            {canUpdateIssues && isLabelComposerOpen ? (
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-2.5">
                <div className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={labelQuery}
                    onChange={(event) => setLabelQuery(event.target.value)}
                    placeholder="Search or create a label"
                    className="h-8 border-none bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                  />
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    onClick={() => {
                      setIsLabelComposerOpen(false);
                      setLabelQuery('');
                    }}
                    aria-label="Close label composer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {filteredAddableLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {filteredAddableLabels.slice(0, 8).map((label) => (
                      <button
                        key={label.id}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors hover:bg-background"
                        style={
                          label.color
                            ? {
                                borderColor: label.color,
                                color: label.color
                              }
                            : undefined
                        }
                        onClick={() => {
                          if (isUpdatingLabels) {
                            return;
                          }

                          setIsUpdatingLabels(true);
                          void onAddLabel(record.issue.id, label.id)
                            .then(() => {
                              setLabelQuery('');
                              setIsLabelComposerOpen(false);
                            })
                            .catch(() => undefined)
                            .finally(() => {
                              setIsUpdatingLabels(false);
                            });
                        }}
                      >
                        {label.color ? (
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: label.color }}
                          />
                        ) : null}
                        {label.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No matching labels.</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="color"
                    value={labelDraftColor}
                    onChange={(event) => setLabelDraftColor(event.target.value)}
                    className="h-8 w-10 bg-background p-1"
                    aria-label="Label color"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    disabled={
                      labelQuery.trim().length === 0 || hasMatchingLabel || isUpdatingLabels
                    }
                    onClick={() => {
                      void handleCreateLabel();
                    }}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Create "{labelQuery.trim()}"
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <InlineIssueDeliveryEditor
            canEdit={canUpdateIssues}
            dueAt={record.sourceIssue.dueAt}
            dueLabel={record.issue.dueLabel}
            estimate={record.sourceIssue.estimate}
            onSave={(input) => onPersistIssue(record.issue.id, input)}
          />

          {isLoadingDetail && !isIssueDetailRecord(record.sourceIssue) ? (
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
              Loading subtasks...
            </div>
          ) : null}

          {isIssueDetailRecord(record.sourceIssue) ? (
            <WorkspaceIssueSubtasksSection
              canCreateSubtask={canCreateIssues}
              canUpdateIssue={canUpdateIssues}
              currentUserId={currentUserId}
              getIssueHref={onIssueHref}
              isCreatingSubtask={isCreatingSubtask}
              members={record.members}
              onCreateSubtask={() => {
                void onCreateSubtask(record.issue.id);
              }}
              onSubtaskDraftChange={onSubtaskDraftChange}
              onUpdateSubtask={(issueId, updater) =>
                onUpdateSubtask(record.issue.id, issueId, updater)
              }
              project={record.project}
              subtaskDraft={subtaskDraft}
              subtasks={issueSubtasks}
            />
          ) : null}

          {isLoadingDetail && !isIssueDetailRecord(record.sourceIssue) ? (
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
              Loading comments and activity...
            </div>
          ) : null}

          <WorkspaceIssueConversationTabs
            activity={issueActivity}
            canCreateComment={canCreateComment}
            commentDraft={commentDraft}
            comments={issueComments}
            isCreatingComment={isCreatingComment}
            onCommentDraftChange={onCommentDraftChange}
            onCreateComment={() => {
              void onCreateComment(record.issue.id);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function WorkspaceIssuesPageContent({
  availableLabels,
  canCreateIssues = false,
  canDeleteIssues = false,
  canUpdateIssues = false,
  currentUserId,
  currentUserLabel,
  issueRecords,
  projects,
  storageScope
}: {
  availableLabels: IssueLabel[];
  canCreateIssues?: boolean;
  canDeleteIssues?: boolean;
  canUpdateIssues?: boolean;
  currentUserId?: number;
  currentUserLabel: string;
  issueRecords: WorkspaceIssueRecord[];
  projects: Project[];
  storageScope: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeProjectId } = useProjectContext();
  const [isDesktop, setIsDesktop] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false);
  const [isSaveViewDialogOpen, setIsSaveViewDialogOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedIssueView[]>([]);
  const [savedViewName, setSavedViewName] = useState('');
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [isCreatingComment, setIsCreatingComment] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [isCreatingSubtask, setIsCreatingSubtask] = useState(false);
  const [deletingIssueId, setDeletingIssueId] = useState<string | null>(null);
  const [labelOptions, setLabelOptions] = useState<IssueLabel[]>(availableLabels);
  const [deletedIssueIds, setDeletedIssueIds] = useState<Record<string, true>>({});
  const [loadingIssueDetailIds, setLoadingIssueDetailIds] = useState<Record<string, boolean>>({});
  const [recordOverrides, setRecordOverrides] = useState<Record<string, WorkspaceIssueRecord>>({});
  const queryState = useMemo(() => parseProjectIssuesQueryParams(searchParams), [searchParams]);
  const savedViewQueryState = useMemo(
    () => getProjectIssuesSavedViewState(queryState),
    [queryState]
  );
  const effectiveProjectId = queryState.projectId;

  const replaceQueryState = (
    nextQuery: Partial<{
      filter: ProjectIssuesFilter;
      issue: string | undefined;
      labelId: string | undefined;
      projectId: string | undefined;
      projectScope: ProjectIssuesProjectScope | undefined;
      search: string | undefined;
    }>
  ) => {
    const hasKey = <T extends object>(object: T, key: keyof T) =>
      Object.prototype.hasOwnProperty.call(object, key);
    const nextParams = toProjectIssuesSearchParams(
      {
        filter: hasKey(nextQuery, 'filter')
          ? (nextQuery.filter ?? queryState.filter)
          : queryState.filter,
        issue: hasKey(nextQuery, 'issue') ? nextQuery.issue : queryState.issue,
        labelId: hasKey(nextQuery, 'labelId') ? nextQuery.labelId : queryState.labelId,
        projectId: hasKey(nextQuery, 'projectId') ? nextQuery.projectId : queryState.projectId,
        projectScope: hasKey(nextQuery, 'projectScope')
          ? nextQuery.projectScope
          : queryState.projectScope,
        search: hasKey(nextQuery, 'search') ? nextQuery.search : queryState.search
      },
      searchParams
    );
    const next = nextParams.toString();
    const current = searchParams.toString();

    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  };

  const replaceWithQueryState = (nextQueryState: ProjectIssuesQueryState) => {
    const nextParams = toProjectIssuesSearchParams(nextQueryState, searchParams);
    const next = nextParams.toString();
    const current = searchParams.toString();

    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  };

  useEffect(() => {
    const synchronizedQueryState = getSynchronizedProjectIssuesQueryState(
      queryState,
      activeProjectId
    );

    if (!synchronizedQueryState) {
      return;
    }

    const nextParams = toProjectIssuesSearchParams(synchronizedQueryState, searchParams);
    const next = nextParams.toString();
    const current = searchParams.toString();

    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [activeProjectId, pathname, queryState, router, searchParams]);

  useEffect(() => {
    setSavedViews(readSavedIssueViews(storageScope));
  }, [storageScope]);

  useEffect(() => {
    setLabelOptions(availableLabels);
  }, [availableLabels]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const sync = () => setIsDesktop(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener('change', sync);

    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  const projectLookup = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );

  const applyUpdatedIssueToRecord = (currentRecord: WorkspaceIssueRecord, updated: IssueDetail) => {
    const mapped = mapIssueToWorkspaceRecord(updated, {
      members: currentRecord.members,
      projectLookup
    });

    setRecordOverrides((current) => ({
      ...current,
      [currentRecord.issue.id]: mapped
    }));
  };

  const effectiveIssueRecords = useMemo(
    () =>
      issueRecords
        .filter((record) => deletedIssueIds[record.issue.id] !== true)
        .map((record) => recordOverrides[record.issue.id] ?? record),
    [deletedIssueIds, issueRecords, recordOverrides]
  );

  const scopedRecords = useMemo(
    () =>
      effectiveIssueRecords.filter(
        (record) => !effectiveProjectId || record.project.id === effectiveProjectId
      ),
    [effectiveIssueRecords, effectiveProjectId]
  );

  const filteredRecords = useMemo(() => {
    const normalizedQuery = queryState.search?.trim().toLowerCase() ?? '';

    return scopedRecords.filter(({ issue, labels, searchText }) => {
      const matchesQuery = normalizedQuery.length === 0 || searchText.includes(normalizedQuery);
      const matchesLabel =
        !queryState.labelId || labels.some((label) => String(label.id) === queryState.labelId);

      return (
        matchesQuery && matchesLabel && matchesFilter(issue, queryState.filter, currentUserLabel)
      );
    });
  }, [currentUserLabel, queryState.filter, queryState.labelId, queryState.search, scopedRecords]);

  const handleCreateIssue = async (input: {
    title: string;
    descriptionMarkdown?: string;
    priority?: IssueDetail['priority'];
    projectId?: number;
  }) => {
    if (!canCreateIssues || isCreatingIssue) {
      return;
    }

    setIsCreatingIssue(true);
    try {
      const created = await issuesApi.createIssue(input);
      const nextParams = toProjectIssuesSearchParams(
        getPostCreateProjectIssuesQueryState(
          queryState,
          created.projectId !== null && created.projectId !== undefined
            ? String(created.projectId)
            : null
        ),
        searchParams
      );
      const next = nextParams.toString();
      setIsCreateDialogOpen(false);
      router.refresh();
      router.push(
        next ? `/issues/${encodeURIComponent(String(created.id))}?${next}` : `/issues/${created.id}`
      );
      toast.success('Issue created');
    } catch (error) {
      toast.error('Failed to create issue', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsCreatingIssue(false);
    }
  };

  const handleIssueUpdate = (
    issueId: string,
    updater: (issue: ProjectIssuePreview) => ProjectIssuePreview
  ) => {
    const currentRecord = effectiveIssueRecords.find((record) => record.issue.id === issueId);
    if (!currentRecord) {
      return;
    }

    const previous = currentRecord.issue;
    const next = updater(previous);
    if (
      !canApplyInlineIssueUpdate(previous, next, { canUpdateIssue: canUpdateIssues, currentUserId })
    ) {
      return;
    }
    const mutation = buildInlineIssueMutation(Number(issueId), previous, next);
    if (!mutation) {
      return;
    }

    setRecordOverrides((current) => ({
      ...current,
      [issueId]: {
        ...currentRecord,
        issue: next
      }
    }));

    void mutation.request
      .then((updated) => {
        applyUpdatedIssueToRecord(currentRecord, updated);
      })
      .catch((error) => {
        setRecordOverrides((current) => {
          const nextRecordOverrides = { ...current };
          delete nextRecordOverrides[issueId];
          return nextRecordOverrides;
        });
        toast.error(mutation.errorTitle, {
          description: error instanceof Error ? error.message : 'Please try again.'
        });
      });
  };

  const handlePersistIssue = async (issueId: string, input: UpdateIssueInput) => {
    const currentRecord = effectiveIssueRecords.find((record) => record.issue.id === issueId);
    if (!currentRecord || !canUpdateIssues) {
      return;
    }

    try {
      const updated = await issuesApi.updateIssue(Number(issueId), {
        baseRevision: currentRecord.issue.revision,
        ...input
      });
      applyUpdatedIssueToRecord(currentRecord, updated);
    } catch (error) {
      toast.error('Failed to update issue', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      throw error;
    }
  };

  const handleAddLabel = async (issueId: string, labelId: number) => {
    const currentRecord = effectiveIssueRecords.find((record) => record.issue.id === issueId);
    if (!currentRecord || !canUpdateIssues) {
      return;
    }

    try {
      const updated = await issuesApi.addIssueLabel(Number(issueId), { labelId });
      applyUpdatedIssueToRecord(currentRecord, updated);
    } catch (error) {
      toast.error('Failed to add label', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      throw error;
    }
  };

  const handleRemoveLabel = async (issueId: string, labelId: number) => {
    const currentRecord = effectiveIssueRecords.find((record) => record.issue.id === issueId);
    if (!currentRecord || !canUpdateIssues) {
      return;
    }

    try {
      const updated = await issuesApi.removeIssueLabel(Number(issueId), labelId);
      applyUpdatedIssueToRecord(currentRecord, updated);
    } catch (error) {
      toast.error('Failed to remove label', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      throw error;
    }
  };

  const handleCreateLabel = async (
    issueId: string,
    input: {
      color: string;
      name: string;
    }
  ) => {
    const currentRecord = effectiveIssueRecords.find((record) => record.issue.id === issueId);
    if (!currentRecord || !canUpdateIssues) {
      return;
    }

    try {
      const createdLabel = await issuesApi.createIssueLabel(input);
      setLabelOptions((current) =>
        current.some((label) => label.id === createdLabel.id) ? current : [...current, createdLabel]
      );
      const updated = await issuesApi.addIssueLabel(Number(issueId), {
        labelId: createdLabel.id
      });
      applyUpdatedIssueToRecord(currentRecord, updated);
    } catch (error) {
      toast.error('Failed to create label', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      throw error;
    }
  };

  const ensureIssueDetail = useCallback(
    (issueId: string) => {
      const currentRecord = effectiveIssueRecords.find((record) => record.issue.id === issueId);
      if (
        !currentRecord ||
        isIssueDetailRecord(currentRecord.sourceIssue) ||
        loadingIssueDetailIds[issueId]
      ) {
        return;
      }

      setLoadingIssueDetailIds((current) => ({
        ...current,
        [issueId]: true
      }));

      void issuesApi
        .getIssue(Number(issueId))
        .then((issueDetail) => {
          applyUpdatedIssueToRecord(currentRecord, issueDetail);
        })
        .catch((error) => {
          toast.error('Failed to load issue details', {
            description: error instanceof Error ? error.message : 'Please try again.'
          });
        })
        .finally(() => {
          setLoadingIssueDetailIds((current) => {
            const next = { ...current };
            delete next[issueId];
            return next;
          });
        });
    },
    [effectiveIssueRecords, loadingIssueDetailIds, projectLookup]
  );

  const handleCreateComment = async (issueId: string) => {
    const currentRecord = effectiveIssueRecords.find((record) => record.issue.id === issueId);
    if (
      !currentRecord ||
      !canUpdateIssues ||
      isCreatingComment ||
      commentDraft.trim().length === 0
    ) {
      return;
    }

    setIsCreatingComment(true);
    try {
      const updated = await issuesApi.createIssueComment(Number(issueId), {
        bodyMarkdown: commentDraft.trim()
      });
      applyUpdatedIssueToRecord(currentRecord, updated);
      setCommentDraft('');
    } catch (error) {
      toast.error('Failed to add comment', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsCreatingComment(false);
    }
  };

  const updateWorkspaceRecordSubtasks = (
    currentRecord: WorkspaceIssueRecord,
    subtasks: IssueListItem[]
  ): WorkspaceIssueRecord => {
    if (!isIssueDetailRecord(currentRecord.sourceIssue)) {
      return currentRecord;
    }

    return {
      ...currentRecord,
      issue: {
        ...currentRecord.issue,
        subtaskCount: subtasks.length,
        subtaskCompletedCount: subtasks.filter((subtask) => subtask.status === 'done').length
      },
      sourceIssue: {
        ...currentRecord.sourceIssue,
        subtasks
      }
    };
  };

  const handleSubtaskUpdate = (
    parentIssueId: string,
    issueId: string,
    updater: (issue: ProjectIssuePreview) => ProjectIssuePreview
  ) => {
    const currentRecord = effectiveIssueRecords.find((record) => record.issue.id === parentIssueId);
    if (!currentRecord || !isIssueDetailRecord(currentRecord.sourceIssue)) {
      return;
    }

    const previousSubtask = currentRecord.sourceIssue.subtasks.find(
      (subtask) => String(subtask.id) === issueId
    );
    if (!previousSubtask) {
      return;
    }

    const previousPreview = mapIssueToPreview(previousSubtask, {
      members: currentRecord.members,
      projectLookup
    });
    const nextPreview = updater(previousPreview);
    if (
      !canApplyInlineIssueUpdate(previousPreview, nextPreview, {
        canUpdateIssue: canUpdateIssues,
        currentUserId
      })
    ) {
      return;
    }

    const mutation = buildInlineIssueMutation(Number(issueId), previousPreview, nextPreview);
    const optimisticSubtask = applyPreviewToWorkspaceSubtask(previousSubtask, nextPreview);
    const optimisticRecord = updateWorkspaceRecordSubtasks(
      currentRecord,
      currentRecord.sourceIssue.subtasks.map((subtask) =>
        String(subtask.id) === issueId ? optimisticSubtask : subtask
      )
    );

    setRecordOverrides((current) => ({
      ...current,
      [parentIssueId]: optimisticRecord
    }));

    if (!mutation) {
      return;
    }

    void mutation.request
      .then(() => issuesApi.getIssue(Number(parentIssueId)))
      .then((updatedParent) => {
        applyUpdatedIssueToRecord(currentRecord, updatedParent);
      })
      .catch((error) => {
        setRecordOverrides((current) => ({
          ...current,
          [parentIssueId]: currentRecord
        }));
        toast.error(mutation.errorTitle, {
          description: error instanceof Error ? error.message : 'Please try again.'
        });
      });
  };

  const handleCreateSubtask = async (parentIssueId: string) => {
    const currentRecord = effectiveIssueRecords.find((record) => record.issue.id === parentIssueId);
    if (
      !currentRecord ||
      !canCreateIssues ||
      isCreatingSubtask ||
      subtaskDraft.trim().length === 0
    ) {
      return;
    }

    setIsCreatingSubtask(true);
    try {
      const projectIdValue = Number(currentRecord.project.id);
      const created = await issuesApi.createIssue({
        title: subtaskDraft.trim(),
        descriptionMarkdown: '',
        ...(Number.isFinite(projectIdValue) ? { projectId: projectIdValue } : {}),
        parentIssueId: Number(parentIssueId)
      });

      if (isIssueDetailRecord(currentRecord.sourceIssue)) {
        const optimisticRecord = updateWorkspaceRecordSubtasks(currentRecord, [
          ...currentRecord.sourceIssue.subtasks,
          created
        ]);
        setRecordOverrides((current) => ({
          ...current,
          [parentIssueId]: optimisticRecord
        }));
      }

      setSubtaskDraft('');

      void issuesApi
        .getIssue(Number(parentIssueId))
        .then((updatedParent) => {
          applyUpdatedIssueToRecord(currentRecord, updatedParent);
        })
        .catch(() => undefined);
    } catch (error) {
      toast.error('Failed to create subtask', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsCreatingSubtask(false);
    }
  };

  const selectedRecord =
    filteredRecords.find((record) => record.issue.id === queryState.issue) ??
    scopedRecords.find((record) => record.issue.id === queryState.issue) ??
    null;
  const selectedIssueComments =
    selectedRecord && isIssueDetailRecord(selectedRecord.sourceIssue)
      ? orderIssueCommentsDesc(selectedRecord.sourceIssue.comments)
      : [];
  const selectedIssueActivity =
    selectedRecord && isIssueDetailRecord(selectedRecord.sourceIssue)
      ? orderIssueActivityDesc(selectedRecord.sourceIssue.activity)
      : [];
  const selectedIssueSubtasks =
    selectedRecord && isIssueDetailRecord(selectedRecord.sourceIssue)
      ? selectedRecord.sourceIssue.subtasks
      : [];
  const detailsOpen = Boolean(selectedRecord);
  const inProgressIssues = scopedRecords.filter(
    (record) => record.issue.stage === 'in_progress'
  ).length;
  const blockedIssues = scopedRecords.filter((record) => record.issue.stage === 'blocked').length;
  const doneIssues = scopedRecords.filter((record) => record.issue.stage === 'done').length;
  const filterOptions: Array<{ label: string; value: ProjectIssuesFilter }> = [
    { label: 'All', value: ProjectIssuesFilter.ALL },
    { label: 'Active', value: ProjectIssuesFilter.ACTIVE },
    { label: 'Backlog', value: ProjectIssuesFilter.BACKLOG },
    { label: 'Blocked', value: ProjectIssuesFilter.BLOCKED },
    { label: 'Done', value: ProjectIssuesFilter.DONE },
    { label: 'Mine', value: ProjectIssuesFilter.MINE }
  ];
  const isDefaultView =
    savedViewQueryState.filter === ProjectIssuesFilter.ALL &&
    savedViewQueryState.labelId === undefined &&
    savedViewQueryState.projectId === undefined &&
    savedViewQueryState.projectScope === undefined &&
    savedViewQueryState.search === undefined;
  const activeSavedView =
    savedViews.find(
      (view) =>
        toProjectIssuesSearchParams(view.query).toString() ===
        toProjectIssuesSearchParams(savedViewQueryState).toString()
    ) ?? null;

  const handleIssueSelect = (issueId: string) => {
    replaceQueryState({ issue: issueId });
    setCommentDraft('');
    setSubtaskDraft('');

    if (!isDesktop) {
      setIsMobileDetailsOpen(true);
    }
  };

  const handleDetailsClose = () => {
    replaceQueryState({ issue: undefined });
    setIsMobileDetailsOpen(false);
    setCommentDraft('');
    setSubtaskDraft('');
  };

  const buildIssueHref = (issueId: string) => {
    const params = toProjectIssuesSearchParams(
      {
        filter: queryState.filter,
        issue: undefined,
        labelId: queryState.labelId,
        projectId: queryState.projectId,
        projectScope: queryState.projectScope,
        search: queryState.search
      },
      searchParams
    );
    const next = params.toString();
    return next ? `/issues/${issueId}?${next}` : `/issues/${issueId}`;
  };

  const handleDeleteIssue = async (issueId: string) => {
    if (!canDeleteIssues || deletingIssueId !== null) {
      return;
    }

    setDeletingIssueId(issueId);
    try {
      await issuesApi.deleteIssue(Number(issueId));
      setDeletedIssueIds((current) => ({
        ...current,
        [issueId]: true
      }));
      setRecordOverrides((current) => {
        const next = { ...current };
        delete next[issueId];
        return next;
      });

      if (queryState.issue === issueId) {
        handleDetailsClose();
      }

      router.refresh();
      toast.success('Issue deleted', {
        description: 'Comments, attached files, and subtasks were deleted with the issue.'
      });
    } catch (error) {
      toast.error('Failed to delete issue', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      throw error;
    } finally {
      setDeletingIssueId(null);
    }
  };

  const handleSaveView = () => {
    const nextViews = upsertSavedIssueView({
      scope: storageScope,
      name: savedViewName,
      query: savedViewQueryState,
      existingId: activeSavedView?.id
    });

    setSavedViews(nextViews);
    setIsSaveViewDialogOpen(false);
    setSavedViewName('');
    toast.success(activeSavedView ? 'Saved view updated' : 'Saved view created');
  };

  const handleApplySavedView = (viewId: string) => {
    const nextView = savedViews.find((view) => view.id === viewId);

    if (!nextView) {
      return;
    }

    replaceWithQueryState(nextView.query);
  };

  const handleDeleteSavedView = () => {
    if (!activeSavedView) {
      return;
    }

    setSavedViews(deleteSavedIssueView(storageScope, activeSavedView.id));
    toast.success('Saved view removed');
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <Card
        className={`${enterpriseCardVariants()} flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden`}
      >
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div
            className={cn(
              'grid min-h-0 flex-1',
              detailsOpen ? 'xl:grid-cols-[minmax(0,1fr)_390px]' : 'xl:grid-cols-[minmax(0,1fr)]'
            )}
          >
            <div className="flex min-h-0 min-w-0 flex-col xl:border-r xl:border-border/70">
              <div className="shrink-0 border-b border-border/70 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 md:gap-4">
                  <WorkspaceStat
                    label="Total"
                    value={scopedRecords.length}
                    icon={MessageSquareMore}
                    iconClassName="bg-blue-500/10 text-blue-600 ring-blue-500/20 group-hover:bg-blue-500/15 dark:text-blue-400"
                    size={WorkspaceStatSize.COMPACT}
                  />
                  <WorkspaceStat
                    label="In Progress"
                    value={inProgressIssues}
                    icon={CircleDotDashed}
                    iconClassName="bg-sky-500/10 text-sky-600 ring-sky-500/20 group-hover:bg-sky-500/15 dark:text-sky-400"
                    size={WorkspaceStatSize.COMPACT}
                  />
                  <WorkspaceStat
                    label="Blocked"
                    value={blockedIssues}
                    icon={AlertCircle}
                    iconClassName="bg-rose-500/10 text-rose-600 ring-rose-500/20 group-hover:bg-rose-500/15 dark:text-rose-400"
                    size={WorkspaceStatSize.COMPACT}
                  />
                  <WorkspaceStat
                    label="Done"
                    value={doneIssues}
                    icon={CheckCircle2}
                    iconClassName="bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 group-hover:bg-emerald-500/15 dark:text-emerald-400"
                    size={WorkspaceStatSize.COMPACT}
                  />
                </div>

                <div className="mt-3 space-y-2.5">
                  <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex w-full flex-col gap-2 xl:max-w-176 xl:flex-row xl:items-center">
                      <div className="relative w-full xl:max-w-xs">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={queryState.search ?? ''}
                          onChange={(event) =>
                            replaceQueryState({
                              issue: undefined,
                              search:
                                event.target.value.trim().length > 0
                                  ? event.target.value
                                  : undefined
                            })
                          }
                          placeholder="Search issues, labels, or IDs"
                          className="h-8 rounded-md border-border/70 bg-background pl-8 text-sm shadow-none"
                        />
                      </div>
                      <Select
                        value={effectiveProjectId ?? '__all__'}
                        onValueChange={(value) => {
                          replaceQueryState({
                            issue: undefined,
                            projectId: value === '__all__' ? undefined : value,
                            projectScope:
                              value === '__all__' ? ProjectIssuesProjectScope.ALL : undefined
                          });
                        }}
                      >
                        <SelectTrigger
                          className={cn('w-full xl:w-[170px]', compactSelectTriggerClassName)}
                        >
                          <SelectValue placeholder="All projects" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All projects</SelectItem>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={queryState.labelId ?? '__all__'}
                        onValueChange={(value) =>
                          replaceQueryState({
                            labelId: value === '__all__' ? undefined : value,
                            issue: undefined
                          })
                        }
                      >
                        <SelectTrigger
                          className={cn('w-full xl:w-[160px]', compactSelectTriggerClassName)}
                        >
                          <SelectValue placeholder="All labels" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All labels</SelectItem>
                          {availableLabels.map((label) => (
                            <SelectItem key={label.id} value={String(label.id)}>
                              {label.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/10 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        <ListFilter className="h-3.5 w-3.5" />
                        <span>{filteredRecords.length} shown</span>
                      </div>
                      {queryState.projectScope === ProjectIssuesProjectScope.CONTEXT &&
                      activeProjectId ? (
                        <div className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                          Context scope
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className="h-8 rounded-md px-3 text-xs font-medium"
                        onClick={() => setIsCreateDialogOpen(true)}
                        disabled={!canCreateIssues || isCreatingIssue}
                      >
                        Create issue
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {filterOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            replaceQueryState({
                              filter: option.value,
                              issue: undefined
                            })
                          }
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
                            queryState.filter === option.value
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : 'border-border/70 bg-muted/10 text-muted-foreground hover:bg-muted/20 hover:text-foreground'
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={activeSavedView?.id ?? '__none__'}
                        onValueChange={(value) => {
                          if (value === '__none__') {
                            return;
                          }

                          handleApplySavedView(value);
                        }}
                      >
                        <SelectTrigger
                          className={cn('w-full xl:w-[180px]', compactSelectTriggerClassName)}
                        >
                          <SelectValue placeholder="Saved views" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Saved views</SelectItem>
                          {savedViews.map((view) => (
                            <SelectItem key={view.id} value={view.id}>
                              {view.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={compactSecondaryButtonClassName}
                        onClick={() => {
                          setSavedViewName(activeSavedView?.name ?? '');
                          setIsSaveViewDialogOpen(true);
                        }}
                      >
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        Save view
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={compactSecondaryButtonClassName}
                        onClick={() =>
                          replaceWithQueryState({
                            filter: ProjectIssuesFilter.ALL,
                            issue: undefined,
                            labelId: undefined,
                            projectId: undefined,
                            projectScope: undefined,
                            search: undefined
                          })
                        }
                        disabled={isDefaultView}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Reset view
                      </Button>
                      {activeSavedView ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={compactSecondaryButtonClassName}
                          onClick={handleDeleteSavedView}
                        >
                          <Bookmark className="mr-1.5 h-3.5 w-3.5" />
                          Delete saved
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden shrink-0 grid-cols-[110px_minmax(0,1.5fr)_140px_110px_110px_56px_44px] gap-3 border-b border-border/70 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground md:grid">
                <span>Issue</span>
                <span>Title</span>
                <span>Project</span>
                <span>Status</span>
                <span>Priority</span>
                <span>Assignee</span>
                <span className="sr-only">Actions</span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="divide-y divide-border/70">
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map((record) => {
                      const isSelected = record.issue.id === selectedRecord?.issue.id;

                      return (
                        <div
                          key={record.issue.id}
                          onClick={() => handleIssueSelect(record.issue.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleIssueSelect(record.issue.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'flex w-full items-start gap-3 px-4 py-2 text-left transition-colors md:grid md:grid-cols-[110px_minmax(0,1.5fr)_140px_110px_110px_56px_44px] md:items-center md:py-1.5',
                            isSelected
                              ? 'bg-primary/5 shadow-[inset_2px_0_0_0_hsl(var(--primary))]'
                              : 'hover:bg-muted/20',
                            'cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                          )}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              {getIssueStatusIcon(record.issue)}
                              <Link
                                href={buildIssueHref(record.issue.id)}
                                onClick={(event) => event.stopPropagation()}
                                className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                              >
                                {record.issue.identifier}
                              </Link>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground md:hidden">
                              <span
                                title={record.project.name}
                                aria-label={getProjectBadgeAccessibleLabel(record.project)}
                              >
                                {getProjectBadgeLabel(record.project)}
                              </span>
                              <span>•</span>
                              <span>{getAssigneeSummary(record.issue)}</span>
                              <span>•</span>
                              <span>{record.issue.updatedLabel}</span>
                            </div>
                          </div>

                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {record.issue.title}
                                </p>
                                <WorkspaceIssueLabelChips labels={record.labels} />
                              </div>
                              <div
                                className="shrink-0 md:hidden"
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <IssueActionsMenu
                                  canDeleteIssue={canDeleteIssues}
                                  issueHref={buildIssueHref(record.issue.id)}
                                  issueIdentifier={record.issue.identifier}
                                  issueTitle={record.issue.title}
                                  isDeleting={deletingIssueId === record.issue.id}
                                  onDeleteIssue={() => handleDeleteIssue(record.issue.id)}
                                  triggerLabel="Open issue row actions"
                                  variant="list-row"
                                />
                              </div>
                              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground md:hidden" />
                            </div>
                            <div className="flex flex-wrap gap-1.5 md:hidden">
                              <InlineStatusEditor
                                issue={record.issue}
                                onUpdate={handleIssueUpdate}
                                disabled={!canUpdateIssues}
                                compact
                              />
                              <InlinePriorityEditor
                                issue={record.issue}
                                onUpdate={handleIssueUpdate}
                                disabled={!canUpdateIssues}
                                compact
                              />
                              <InlineAssigneeEditor
                                canManageAssignees={canUpdateIssues}
                                currentUserId={currentUserId}
                                issue={record.issue}
                                onUpdate={handleIssueUpdate}
                                options={buildIssueAssigneeOptions(
                                  record.members,
                                  record.issue.assignees
                                )}
                              />
                              {record.issue.labels.slice(0, 2).map((label) => (
                                <Badge
                                  key={label}
                                  size="sm"
                                  className={cn('rounded-full px-2 py-0.5', getLabelClass(label))}
                                >
                                  {label}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="hidden min-w-0 md:block">
                            <Badge
                              variant="outline"
                              className="rounded-full px-2 py-0.5"
                              title={record.project.name}
                              aria-label={getProjectBadgeAccessibleLabel(record.project)}
                            >
                              {getProjectBadgeLabel(record.project)}
                            </Badge>
                          </div>

                          <div className="hidden min-w-0 md:block">
                            <InlineStatusEditor
                              issue={record.issue}
                              onUpdate={handleIssueUpdate}
                              disabled={!canUpdateIssues}
                              compact
                            />
                          </div>

                          <div className="hidden min-w-0 md:block">
                            <InlinePriorityEditor
                              issue={record.issue}
                              onUpdate={handleIssueUpdate}
                              disabled={!canUpdateIssues}
                              compact
                            />
                          </div>

                          <div className="hidden md:block">
                            <InlineAssigneeEditor
                              align={IssueAssigneeMenuAlign.END}
                              canManageAssignees={canUpdateIssues}
                              currentUserId={currentUserId}
                              issue={record.issue}
                              onUpdate={handleIssueUpdate}
                              options={buildIssueAssigneeOptions(
                                record.members,
                                record.issue.assignees
                              )}
                            />
                          </div>

                          <div
                            className="hidden md:flex md:justify-end"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <IssueActionsMenu
                              canDeleteIssue={canDeleteIssues}
                              issueHref={buildIssueHref(record.issue.id)}
                              issueIdentifier={record.issue.identifier}
                              issueTitle={record.issue.title}
                              isDeleting={deletingIssueId === record.issue.id}
                              onDeleteIssue={() => handleDeleteIssue(record.issue.id)}
                              triggerLabel="Open issue row actions"
                              variant="list-row"
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-6 py-16 text-center">
                      <p className="text-sm font-medium text-foreground">
                        No issues match this view.
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Try a broader search or switch filters to inspect more issues.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {detailsOpen ? (
              <aside className="hidden min-h-0 min-w-0 xl:flex xl:flex-col">
                <WorkspaceIssueDetailsPanel
                  availableLabels={labelOptions}
                  canCreateIssues={canCreateIssues}
                  canDeleteIssues={canDeleteIssues}
                  canCreateComment={canUpdateIssues}
                  canUpdateIssues={canUpdateIssues}
                  commentDraft={commentDraft}
                  currentUserId={currentUserId}
                  deletingIssueId={deletingIssueId}
                  isCreatingComment={isCreatingComment}
                  isCreatingSubtask={isCreatingSubtask}
                  isLoadingDetail={
                    selectedRecord ? loadingIssueDetailIds[selectedRecord.issue.id] === true : false
                  }
                  issueActivity={selectedIssueActivity}
                  issueComments={selectedIssueComments}
                  issueSubtasks={selectedIssueSubtasks}
                  onAddLabel={handleAddLabel}
                  onCommentDraftChange={setCommentDraft}
                  onCreateLabel={handleCreateLabel}
                  onCreateComment={handleCreateComment}
                  onCreateSubtask={handleCreateSubtask}
                  onDeleteIssue={handleDeleteIssue}
                  onEnsureIssueDetail={ensureIssueDetail}
                  onIssueHref={buildIssueHref}
                  onPersistIssue={handlePersistIssue}
                  onRemoveLabel={handleRemoveLabel}
                  onSubtaskDraftChange={setSubtaskDraft}
                  onUpdateSubtask={handleSubtaskUpdate}
                  onUpdate={handleIssueUpdate}
                  subtaskDraft={subtaskDraft}
                  record={selectedRecord}
                />
              </aside>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isMobileDetailsOpen && Boolean(selectedRecord)}
        onOpenChange={(open) => {
          setIsMobileDetailsOpen(open);
          if (!open) {
            handleDetailsClose();
          }
        }}
      >
        <DialogContent className="max-w-[calc(100vw-1.5rem)] p-0 sm:max-w-xl xl:hidden">
          <DialogHeader className="border-b border-border/70 px-5 py-4">
            <DialogTitle>Issue details</DialogTitle>
            <DialogDescription>
              Inspect the selected issue without leaving the workspace queue.
            </DialogDescription>
          </DialogHeader>
          <WorkspaceIssueDetailsPanel
            availableLabels={labelOptions}
            canCreateIssues={canCreateIssues}
            canDeleteIssues={canDeleteIssues}
            canCreateComment={canUpdateIssues}
            canUpdateIssues={canUpdateIssues}
            commentDraft={commentDraft}
            currentUserId={currentUserId}
            deletingIssueId={deletingIssueId}
            isCreatingComment={isCreatingComment}
            isCreatingSubtask={isCreatingSubtask}
            isLoadingDetail={
              selectedRecord ? loadingIssueDetailIds[selectedRecord.issue.id] === true : false
            }
            issueActivity={selectedIssueActivity}
            issueComments={selectedIssueComments}
            issueSubtasks={selectedIssueSubtasks}
            onAddLabel={handleAddLabel}
            onCommentDraftChange={setCommentDraft}
            onCreateLabel={handleCreateLabel}
            onCreateComment={handleCreateComment}
            onCreateSubtask={handleCreateSubtask}
            onDeleteIssue={handleDeleteIssue}
            onEnsureIssueDetail={ensureIssueDetail}
            onIssueHref={buildIssueHref}
            onPersistIssue={handlePersistIssue}
            onRemoveLabel={handleRemoveLabel}
            onSubtaskDraftChange={setSubtaskDraft}
            onUpdateSubtask={handleSubtaskUpdate}
            onUpdate={handleIssueUpdate}
            subtaskDraft={subtaskDraft}
            record={selectedRecord}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveViewDialogOpen} onOpenChange={setIsSaveViewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{activeSavedView ? 'Update saved view' : 'Save current view'}</DialogTitle>
            <DialogDescription>
              Save the current project, label, search, and status filters as a reusable issue view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={savedViewName}
              onChange={(event) => setSavedViewName(event.target.value)}
              placeholder="Release triage"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsSaveViewDialogOpen(false);
                  setSavedViewName('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveView}
                disabled={savedViewName.trim().length === 0}
              >
                Save view
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <IssueCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={handleCreateIssue}
        projects={projects}
        defaultProjectId={effectiveProjectId ?? activeProjectId ?? undefined}
        isSubmitting={isCreatingIssue}
      />
    </div>
  );
}

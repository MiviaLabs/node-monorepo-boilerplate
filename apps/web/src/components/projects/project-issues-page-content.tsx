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
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDotDashed,
  Download,
  X,
  ListFilter,
  LoaderCircle,
  MessageSquareMore,
  Paperclip,
  Search,
  Trash2,
  UploadCloud
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react';
import { toast } from 'sonner';

import type { ChangeEvent } from 'react';
import type {
  IssueActivity,
  IssueAttachment,
  IssueComment,
  IssueDetail,
  IssueLabel,
  IssueListItem,
  IssueParticipant,
  IssueRelation,
  CreateIssueAttachmentUploadInput,
  UpdateIssueInput
} from '~/types/issue.types';
import type { Project, ProjectMember } from '~/types/project.types';

import { ContentCodeBlockExtension } from '~/components/content/content-code-block-node';
import { ContentHeadingExtension } from '~/components/content/content-heading-extension';
import { IssueActionsMenu } from '~/components/issues/issue-actions-menu';
import { CompactIssueConversationTabs } from '~/components/issues/issue-conversation';
import { IssueCreateDialog } from '~/components/issues/issue-create-dialog';
import {
  buildIssueAssigneeOptions,
  getAssigneeSummary,
  getIssueToneClass,
  getIssueStatusIcon,
  IssueAssigneeMenuAlign,
  InlineAssigneeEditor,
  InlineIssueDeliveryEditor,
  InlinePriorityEditor,
  InlineStatusEditor
} from '~/components/issues/issue-inline-editors';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
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
import { Progress } from '~/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';
import { WorkspaceStat, WorkspaceStatSize } from '~/components/ui/workspace-stat';
import { issuesApi } from '~/lib/api/issues-api';
import { orderIssueActivityDesc, orderIssueCommentsDesc } from '~/lib/issues/issue-feed-order';
import {
  buildInlineIssueMutation,
  canApplyInlineIssueUpdate
} from '~/lib/issues/issue-inline-editing';
import {
  ProjectIssueStage,
  getProjectIssuesPreview,
  type ProjectIssuePreview
} from '~/lib/issues/issue-preview-data';
import { mapIssueToPreview } from '~/lib/issues/issue-view-models';
import {
  parseMarkdownToContentDoc,
  serializeContentDocToMarkdown
} from '~/lib/projects/project-content-markdown';
import {
  getPostCreateProjectIssuesQueryState,
  parseProjectIssuesQueryParams,
  toProjectIssuesSearchParams,
  ProjectIssuesFilter
} from '~/lib/projects/project-issues-query-params';
import { cn } from '~/lib/utils';

interface ProjectIssuesPageContentProps {
  canUpdateIssue?: boolean;
  currentUserId?: number;
  members: ProjectMember[];
  project: Project;
}

function getProjectBadgeLabel(project: Project): string {
  return project.key?.trim() || 'ORG';
}

function getProjectBadgeAccessibleLabel(project: Project): string {
  return `Project ${getProjectBadgeLabel(project)}: ${project.name}`;
}

function toIssueStatusValue(stage: ProjectIssuePreview['stage']): IssueListItem['status'] {
  return stage;
}

function toIssuePriorityValue(
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

function getParticipantLabel(
  participant: IssueComment | { userId: number; displayName: string | null }
): string {
  if ('authorUserId' in participant) {
    return participant.authorDisplayName?.trim() || `User ${participant.authorUserId}`;
  }

  return participant.displayName?.trim() || `User ${participant.userId}`;
}

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

function formatAttachmentSize(byteSize: number): string {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }

  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAttachmentTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function applyPreviewToSubtask(
  subtask: IssueListItem,
  preview: ProjectIssuePreview
): IssueListItem {
  return {
    ...subtask,
    status: toIssueStatusValue(preview.stage),
    priority: toIssuePriorityValue(preview.priorityLabel),
    assignees: preview.assignees.map((assignee) => ({
      userId: assignee.userId,
      displayName: assignee.name,
      photoUrl: assignee.avatarUrl
    }))
  };
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

function ProjectIssueLabelChips({ labels }: { labels: string[] }) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <div className="hidden flex-wrap gap-1.5 md:flex">
      {labels.map((labelName) => (
        <Badge
          key={labelName}
          size="sm"
          className={cn('rounded-full px-2 py-0.5 text-[10px]', getLabelClass(labelName))}
        >
          {labelName}
        </Badge>
      ))}
    </div>
  );
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
    return issue.stage === ProjectIssueStage.IN_PROGRESS;
  }

  if (filter === ProjectIssuesFilter.BACKLOG) {
    return issue.stage === ProjectIssueStage.BACKLOG;
  }

  if (filter === ProjectIssuesFilter.BLOCKED) {
    return issue.stage === ProjectIssueStage.BLOCKED;
  }

  if (filter === ProjectIssuesFilter.DONE) {
    return issue.stage === ProjectIssueStage.DONE;
  }

  return issue.assignees.some((assignee) => assignee.name === currentUserLabel);
}

function getPrimaryAssignee(issue: ProjectIssuePreview) {
  return issue.assignees[0] ?? null;
}

function getParticipantInitials(label: string): string {
  return (
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'NA'
  );
}

function CompactIssueMeta({
  availableLabels = [],
  assigneeOptions,
  canUpdateIssue = false,
  currentLabels,
  currentRelations,
  currentUserId,
  issue,
  isTogglingWatcher = false,
  isUpdatingLabels = false,
  isUpdatingRelations = false,
  labelDraftColor = '#94a3b8',
  labelDraftName = '',
  newLabelSelection = '',
  newRelationTargetId = '',
  newRelationType = 'related',
  onAddLabel,
  onAddRelation,
  onCreateLabel,
  onLabelColorChange,
  onLabelDraftChange,
  onLabelSelectionChange,
  onPersistIssue,
  onRelationTargetChange,
  onRelationTypeChange,
  onRemoveRelation,
  onRemoveLabel,
  onUpdate,
  onToggleWatcher,
  relationCandidates = [],
  watchers
}: {
  availableLabels?: IssueLabel[];
  assigneeOptions: ProjectIssuePreview['assignees'];
  canUpdateIssue?: boolean;
  currentLabels?: IssueLabel[];
  currentRelations?: IssueRelation[];
  currentUserId?: number;
  issue: ProjectIssuePreview;
  isTogglingWatcher?: boolean;
  isUpdatingLabels?: boolean;
  isUpdatingRelations?: boolean;
  labelDraftColor?: string;
  labelDraftName?: string;
  newLabelSelection?: string;
  newRelationTargetId?: string;
  newRelationType?: IssueRelation['relationType'];
  onAddLabel?: () => void;
  onAddRelation?: () => void;
  onCreateLabel?: () => void;
  onLabelColorChange?: (value: string) => void;
  onLabelDraftChange?: (value: string) => void;
  onLabelSelectionChange?: (value: string) => void;
  onPersistIssue?: (input: UpdateIssueInput) => Promise<void>;
  onRelationTargetChange?: (value: string) => void;
  onRelationTypeChange?: (value: IssueRelation['relationType']) => void;
  onRemoveRelation?: (relationId: number) => void;
  onRemoveLabel?: (labelId: number) => void;
  onUpdate: (issueId: string, updater: (issue: ProjectIssuePreview) => ProjectIssuePreview) => void;
  onToggleWatcher?: () => void;
  relationCandidates?: IssueListItem[];
  watchers?: IssueParticipant[];
}) {
  const effectiveLabels =
    currentLabels ??
    issue.labels.map((label, index) => ({
      id: -(index + 1),
      name: label,
      color: null,
      description: null,
      projectId: null
    }));
  const effectiveRelations = currentRelations ?? [];
  const isWatching =
    currentUserId !== undefined &&
    (watchers ?? []).some((watcher) => watcher.userId === currentUserId);
  const addableLabels = availableLabels.filter(
    (label) => !effectiveLabels.some((current) => current.id === label.id)
  );

  return (
    <div className="rounded-lg border border-border/60 bg-muted/5 p-3">
      <div className="space-y-3">
        <div className="grid gap-3 border-b border-border/60 pb-3">
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Assignee
            </p>
            <InlineAssigneeEditor
              canManageAssignees={canUpdateIssue}
              currentUserId={currentUserId}
              issue={issue}
              onUpdate={onUpdate}
              options={assigneeOptions}
              showLabel
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </p>
              <InlineStatusEditor issue={issue} onUpdate={onUpdate} disabled={!canUpdateIssue} />
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Priority
              </p>
              <InlinePriorityEditor issue={issue} onUpdate={onUpdate} disabled={!canUpdateIssue} />
            </div>
          </div>
        </div>

        <InlineIssueDeliveryEditor
          canEdit={canUpdateIssue}
          dueAt={issue.dueAt}
          dueLabel={issue.dueLabel}
          estimate={issue.estimate}
          onSave={async (input) => {
            await onPersistIssue?.(input);
          }}
        />

        <div className="space-y-1 border-t border-border/60 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Activity
          </p>
          <div className="flex flex-wrap gap-2.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MessageSquareMore className="h-3.5 w-3.5" />
              {issue.commentsCount} comments
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" />
              {issue.attachmentsCount} files
            </span>
            <span>{issue.updatedLabel}</span>
          </div>
        </div>

        {watchers ? (
          <div className="space-y-1.5 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Watchers
              </p>
              <Button
                type="button"
                size="sm"
                variant={isWatching ? 'secondary' : 'outline'}
                className="h-6.5 px-2 text-[11px]"
                disabled={!canUpdateIssue || isTogglingWatcher}
                onClick={onToggleWatcher}
              >
                <Bell className="h-3.5 w-3.5" />
                {isWatching ? 'Watching' : 'Watch'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {watchers.length > 0 ? (
                watchers.map((watcher) => {
                  const label = getParticipantLabel(watcher);
                  return (
                    <div
                      key={watcher.userId}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px]"
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={watcher.photoUrl ?? undefined} alt={label} />
                        <AvatarFallback className="bg-muted text-[8px] font-semibold">
                          {getParticipantInitials(label)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{label}</span>
                    </div>
                  );
                })
              ) : (
                <span className="text-xs text-muted-foreground">No watchers yet.</span>
              )}
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Labels
          </p>
          <div className="flex flex-wrap gap-1.5">
            {effectiveLabels.length > 0 ? (
              effectiveLabels.map((label) => (
                <Badge
                  key={label.id}
                  size="sm"
                  className={cn('rounded-full px-2 py-0.5', getLabelClass(label.name))}
                >
                  {label.name}
                  {canUpdateIssue ? (
                    <button
                      type="button"
                      className="ml-1 inline-flex items-center text-current/70 hover:text-current"
                      onClick={() => onRemoveLabel?.(label.id)}
                      disabled={isUpdatingLabels}
                      aria-label={`Remove ${label.name} label`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </Badge>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground">No labels yet.</span>
            )}
          </div>
          {canUpdateIssue ? (
            <div className="space-y-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={newLabelSelection}
                  onValueChange={(value) => onLabelSelectionChange?.(value)}
                >
                  <SelectTrigger className="h-7.5 w-[190px] text-[12px]">
                    <SelectValue placeholder="Add existing label" />
                  </SelectTrigger>
                  <SelectContent>
                    {addableLabels.length > 0 ? (
                      addableLabels.map((label) => (
                        <SelectItem key={label.id} value={String(label.id)}>
                          {label.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__none__" disabled>
                        No labels available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7.5 px-2 text-[11px]"
                  disabled={!newLabelSelection || isUpdatingLabels}
                  onClick={onAddLabel}
                >
                  Add label
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={labelDraftName}
                  onChange={(event) => onLabelDraftChange?.(event.target.value)}
                  placeholder="Create label"
                  className="h-7.5 w-[190px] text-[12px]"
                />
                <Input
                  type="color"
                  value={labelDraftColor}
                  onChange={(event) => onLabelColorChange?.(event.target.value)}
                  className="h-7.5 w-10 p-1"
                  aria-label="Label color"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7.5 px-2 text-[11px]"
                  disabled={labelDraftName.trim().length === 0 || isUpdatingLabels}
                  onClick={onCreateLabel}
                >
                  Create
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Relations
          </p>
          <div className="flex flex-wrap gap-1.5">
            {effectiveRelations.length > 0 ? (
              effectiveRelations.map((relation) => (
                <Badge
                  key={relation.id}
                  size="sm"
                  variant="outline"
                  className="rounded-full px-2 py-0.5 text-[11px]"
                >
                  {relation.relationType.replace('_', ' ')} #{relation.relatedIssueNumber}
                  {canUpdateIssue ? (
                    <button
                      type="button"
                      className="ml-1 inline-flex items-center text-current/70 hover:text-current"
                      onClick={() => onRemoveRelation?.(relation.id)}
                      disabled={isUpdatingRelations}
                      aria-label={`Remove relation ${relation.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </Badge>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground">No relations yet.</span>
            )}
          </div>
          {canUpdateIssue ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Select
                value={newRelationType}
                onValueChange={(value) =>
                  onRelationTypeChange?.(value as IssueRelation['relationType'])
                }
              >
                <SelectTrigger className="h-7.5 w-[145px] text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="related">Related</SelectItem>
                  <SelectItem value="blocks">Blocks</SelectItem>
                  <SelectItem value="blocked_by">Blocked by</SelectItem>
                  <SelectItem value="duplicate_of">Duplicate of</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={newRelationTargetId}
                onValueChange={(value) => onRelationTargetChange?.(value)}
              >
                <SelectTrigger className="h-7.5 w-[210px] text-[12px]">
                  <SelectValue placeholder="Link issue" />
                </SelectTrigger>
                <SelectContent>
                  {relationCandidates.length > 0 ? (
                    relationCandidates.map((candidate) => (
                      <SelectItem key={candidate.id} value={String(candidate.id)}>
                        #{candidate.issueNumber} {candidate.title}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__none__" disabled>
                      No matching issues
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7.5 px-2 text-[11px]"
                disabled={!newRelationTargetId || isUpdatingRelations}
                onClick={onAddRelation}
              >
                Add relation
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function IssueDescriptionSection({
  canEdit,
  issue,
  onSave
}: {
  canEdit: boolean;
  issue: ProjectIssuePreview;
  onSave: (nextDescriptionMarkdown: string) => Promise<void>;
}) {
  const descriptionMarkdown = issue.descriptionMarkdown ?? issue.description;
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
        'data-project-issue-description-editor': 'true'
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
    <section className="rounded-lg border border-border/60 bg-background p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Description
        </p>
        {isSaving ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <LoaderCircle className="h-3 w-3 animate-spin" />
            Saving
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 rounded-lg border border-border/60 bg-background/80 px-2.5 py-2">
        {editor ? (
          <EditorContent
            editor={editor}
            onBlurCapture={() => {
              void handleBlur();
            }}
            className="min-h-[128px] [&_.ProseMirror]:min-h-[112px] [&_.ProseMirror]:outline-hidden [&_.ProseMirror]:text-[12.5px] [&_.ProseMirror]:leading-5 [&_.ProseMirror_a]:text-foreground [&_.ProseMirror_a]:underline [&_.ProseMirror_blockquote]:border-l [&_.ProseMirror_blockquote]:border-border/80 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-muted-foreground [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-foreground/6 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_h1]:text-lg [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:text-sm [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h4]:text-sm [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_li]:my-0.5 [&_.ProseMirror_p]:my-1 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-xl [&_.ProseMirror_pre]:bg-slate-950 [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:text-slate-100 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ul[data-type='taskList']]:my-2 [&_.ProseMirror_ul[data-type='taskList']]:list-none [&_.ProseMirror_ul[data-type='taskList']]:space-y-1 [&_.ProseMirror_ul[data-type='taskList']]:pl-0 [&_.ProseMirror_ul[data-type='taskList']_li]:my-0 [&_.ProseMirror_ul[data-type='taskList']_li]:flex [&_.ProseMirror_ul[data-type='taskList']_li]:items-start [&_.ProseMirror_ul[data-type='taskList']_li]:gap-2 [&_.ProseMirror_ul[data-type='taskList']_li>label]:flex [&_.ProseMirror_ul[data-type='taskList']_li>label]:h-5 [&_.ProseMirror_ul[data-type='taskList']_li>label]:items-center [&_.ProseMirror_ul[data-type='taskList']_li>label]:shrink-0 [&_.ProseMirror_ul[data-type='taskList']_li>label>input]:m-0 [&_.ProseMirror_ul[data-type='taskList']_li>div]:min-w-0 [&_.ProseMirror_ul[data-type='taskList']_li>div]:flex-1 [&_.ProseMirror_ul[data-type='taskList']_li>div>p]:my-0 [&_.ProseMirror_ul[data-type='taskList']_li>div>p]:leading-5 [&_.ProseMirror_.is-empty]:before:pointer-events-none [&_.ProseMirror_.is-empty]:before:float-left [&_.ProseMirror_.is-empty]:before:h-0 [&_.ProseMirror_.is-empty]:before:text-muted-foreground [&_.ProseMirror_.is-empty]:before:content-[attr(data-placeholder)]"
          />
        ) : null}
      </div>
    </section>
  );
}

function IssueSidebarSections({
  availableLabels = [],
  assigneeOptions,
  canUpdateIssue = false,
  currentLabels,
  currentRelations,
  currentUserId,
  issue,
  isTogglingWatcher = false,
  isUpdatingLabels = false,
  isUpdatingRelations = false,
  labelDraftColor = '#94a3b8',
  labelDraftName = '',
  newLabelSelection = '',
  newRelationTargetId = '',
  newRelationType = 'related',
  onAddLabel,
  onAddRelation,
  onCreateLabel,
  onLabelColorChange,
  onLabelDraftChange,
  onLabelSelectionChange,
  onPersistIssue,
  onRelationTargetChange,
  onRelationTypeChange,
  onRemoveRelation,
  onRemoveLabel,
  onUpdate,
  onToggleWatcher,
  relationCandidates = [],
  watchers
}: {
  availableLabels?: IssueLabel[];
  assigneeOptions: ProjectIssuePreview['assignees'];
  canUpdateIssue?: boolean;
  currentLabels?: IssueLabel[];
  currentRelations?: IssueRelation[];
  currentUserId?: number;
  issue: ProjectIssuePreview;
  isTogglingWatcher?: boolean;
  isUpdatingLabels?: boolean;
  isUpdatingRelations?: boolean;
  labelDraftColor?: string;
  labelDraftName?: string;
  newLabelSelection?: string;
  newRelationTargetId?: string;
  newRelationType?: IssueRelation['relationType'];
  onAddLabel?: () => void;
  onAddRelation?: () => void;
  onCreateLabel?: () => void;
  onLabelColorChange?: (value: string) => void;
  onLabelDraftChange?: (value: string) => void;
  onLabelSelectionChange?: (value: string) => void;
  onPersistIssue?: (input: UpdateIssueInput) => Promise<void>;
  onRelationTargetChange?: (value: string) => void;
  onRelationTypeChange?: (value: IssueRelation['relationType']) => void;
  onRemoveRelation?: (relationId: number) => void;
  onRemoveLabel?: (labelId: number) => void;
  onUpdate: (issueId: string, updater: (issue: ProjectIssuePreview) => ProjectIssuePreview) => void;
  onToggleWatcher?: () => void;
  relationCandidates?: IssueListItem[];
  watchers?: IssueParticipant[];
}) {
  return (
    <div className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
      <div className="space-y-3 px-4 py-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
        <CompactIssueMeta
          availableLabels={availableLabels}
          issue={issue}
          assigneeOptions={assigneeOptions}
          canUpdateIssue={canUpdateIssue}
          currentLabels={currentLabels}
          currentRelations={currentRelations}
          currentUserId={currentUserId}
          isTogglingWatcher={isTogglingWatcher}
          isUpdatingLabels={isUpdatingLabels}
          isUpdatingRelations={isUpdatingRelations}
          labelDraftColor={labelDraftColor}
          labelDraftName={labelDraftName}
          newLabelSelection={newLabelSelection}
          newRelationTargetId={newRelationTargetId}
          newRelationType={newRelationType}
          onAddLabel={onAddLabel}
          onAddRelation={onAddRelation}
          onCreateLabel={onCreateLabel}
          onLabelColorChange={onLabelColorChange}
          onLabelDraftChange={onLabelDraftChange}
          onLabelSelectionChange={onLabelSelectionChange}
          onPersistIssue={onPersistIssue}
          onRelationTargetChange={onRelationTargetChange}
          onRelationTypeChange={onRelationTypeChange}
          onRemoveRelation={onRemoveRelation}
          onRemoveLabel={onRemoveLabel}
          onUpdate={onUpdate}
          onToggleWatcher={onToggleWatcher}
          relationCandidates={relationCandidates}
          watchers={watchers}
        />
      </div>
    </div>
  );
}

function IssueConversationTabs({
  activity,
  canCreateComment,
  commentDraft,
  comments,
  onCommentDraftChange,
  onCreateComment,
  isCreatingComment
}: {
  activity: IssueActivity[];
  canCreateComment: boolean;
  commentDraft: string;
  comments: IssueComment[];
  onCommentDraftChange: (value: string) => void;
  onCreateComment: () => void;
  isCreatingComment: boolean;
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

function IssueAttachmentsSection({
  attachments,
  downloadingAttachmentId,
  canDeleteAttachment,
  canUploadAttachment,
  deletingAttachmentId,
  fileInputId,
  isUploadingAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  onFileChange
}: {
  attachments: IssueAttachment[];
  downloadingAttachmentId: number | null;
  canDeleteAttachment: boolean;
  canUploadAttachment: boolean;
  deletingAttachmentId: number | null;
  fileInputId: string;
  isUploadingAttachment: boolean;
  onDownloadAttachment: (attachment: IssueAttachment) => void;
  onDeleteAttachment: (attachmentId: number) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Attachments</p>
          <p className="text-xs text-muted-foreground">
            Files are removed from the issue immediately and purged later through retention cleanup.
          </p>
        </div>
        {canUploadAttachment ? (
          <div className="flex items-center gap-2">
            <input
              id={fileInputId}
              type="file"
              className="sr-only"
              onChange={onFileChange}
              disabled={isUploadingAttachment}
            />
            <Button asChild size="sm" disabled={isUploadingAttachment}>
              <label htmlFor={fileInputId} className="cursor-pointer">
                {isUploadingAttachment ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="mr-2 h-4 w-4" />
                )}
                {isUploadingAttachment ? 'Uploading...' : 'Upload file'}
              </label>
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 divide-y divide-border/50 rounded-lg border border-border/60 bg-muted/5">
        {attachments.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-muted-foreground">No attachments yet.</p>
        ) : (
          attachments.map((attachment) => {
            const isDeleting = deletingAttachmentId === attachment.id;
            const isDownloading = downloadingAttachmentId === attachment.id;

            return (
              <div
                key={attachment.id}
                className="flex items-center justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="truncate text-sm font-medium text-foreground">
                      {attachment.originalFilename}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{formatAttachmentSize(attachment.byteSize)}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarImage
                          src={attachment.uploaderPhotoUrl ?? undefined}
                          alt={
                            attachment.uploaderDisplayName?.trim() ||
                            `User ${attachment.uploadedByUserId}`
                          }
                        />
                        <AvatarFallback className="bg-muted text-[8px] font-semibold">
                          {getParticipantInitials(
                            attachment.uploaderDisplayName?.trim() ||
                              `User ${attachment.uploadedByUserId}`
                          )}
                        </AvatarFallback>
                      </Avatar>
                      {attachment.uploaderDisplayName?.trim() ||
                        `User ${attachment.uploadedByUserId}`}
                    </span>
                    <span>{formatAttachmentTime(attachment.createdAt)}</span>
                    <span>{attachment.status ?? 'unknown'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={isDownloading || attachment.fileId === null}
                    onClick={() => onDownloadAttachment(attachment)}
                    aria-label={`Download ${attachment.originalFilename}`}
                  >
                    {isDownloading ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                  {canDeleteAttachment ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isDeleting}
                      onClick={() => onDeleteAttachment(attachment.id)}
                    >
                      {isDeleting ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function IssueSubtasksSection({
  canUpdateIssue,
  canCreateSubtask,
  currentUserId,
  createHrefQuery,
  isCreatingSubtask,
  members,
  onCreateSubtask,
  onUpdateSubtask,
  onSubtaskDraftChange,
  project,
  subtaskDraft,
  subtasks
}: {
  canUpdateIssue: boolean;
  canCreateSubtask: boolean;
  currentUserId: number;
  createHrefQuery: string;
  isCreatingSubtask: boolean;
  members: ProjectMember[];
  onCreateSubtask: () => void;
  onUpdateSubtask: (
    issueId: string,
    updater: (issue: ProjectIssuePreview) => ProjectIssuePreview
  ) => void;
  onSubtaskDraftChange: (value: string) => void;
  project: Project;
  subtaskDraft: string;
  subtasks: IssueListItem[];
}) {
  const completedCount = subtasks.filter((subtask) => subtask.status === 'done').length;
  const progressValue = subtasks.length > 0 ? (completedCount / subtasks.length) * 100 : 0;

  return (
    <section className="rounded-lg border border-border/60 bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-foreground">Subtasks</p>
          <p className="text-[11px] text-muted-foreground">
            {completedCount} of {subtasks.length} complete
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">{Math.round(progressValue)}%</span>
      </div>
      <Progress className="mt-2 h-1.5 bg-muted/60" value={progressValue} />

      <div className="mt-2.5 space-y-1.5">
        {subtasks.map((subtask) => (
          <IssueSubtaskRow
            key={subtask.id}
            canUpdateIssue={canUpdateIssue}
            createHrefQuery={createHrefQuery}
            currentUserId={currentUserId}
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

function IssueSubtaskRow({
  canUpdateIssue,
  createHrefQuery,
  currentUserId,
  members,
  onUpdateSubtask,
  project,
  subtask
}: {
  canUpdateIssue: boolean;
  createHrefQuery: string;
  currentUserId: number;
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
          href={`/issues/${subtask.id}${createHrefQuery}`}
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

function IssueDetailsPanel({
  assigneeOptions,
  canUpdateIssue = false,
  currentUserId,
  issue,
  isTogglingWatcher = false,
  issueHref,
  onClose,
  onPersistIssue,
  onUpdateIssue,
  onToggleWatcher,
  showCloseButton = false
}: {
  assigneeOptions: ProjectIssuePreview['assignees'];
  canUpdateIssue?: boolean;
  currentUserId?: number;
  issue: ProjectIssuePreview | null;
  isTogglingWatcher?: boolean;
  issueHref?: string;
  onClose?: () => void;
  onPersistIssue?: (input: UpdateIssueInput) => Promise<void>;
  onUpdateIssue: (
    issueId: string,
    updater: (issue: ProjectIssuePreview) => ProjectIssuePreview
  ) => void;
  onToggleWatcher?: () => void;
  showCloseButton?: boolean;
}) {
  if (!issue) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
        Select an issue to inspect its status, scope, and recent activity.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {issueHref ? (
                <Link
                  href={issueHref}
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  {issue.identifier}
                </Link>
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {issue.identifier}
                </span>
              )}
              <Badge
                size="sm"
                className={cn('rounded-full px-2 py-0.5', getIssueToneClass(issue.tone))}
              >
                {issue.statusLabel}
              </Badge>
            </div>
            {issueHref ? (
              <Link
                href={issueHref}
                className="text-lg font-semibold leading-tight text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                {issue.title}
              </Link>
            ) : (
              <h2 className="text-lg font-semibold leading-tight text-foreground">{issue.title}</h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            {getIssueStatusIcon(issue)}
            {showCloseButton ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={onClose}
                aria-label="Close issue details"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border/70 bg-muted/10 p-4 text-sm leading-6 text-muted-foreground">
          {issue.description}
        </div>
      </div>

      <IssueSidebarSections
        issue={issue}
        assigneeOptions={assigneeOptions}
        canUpdateIssue={canUpdateIssue}
        currentUserId={currentUserId}
        isTogglingWatcher={isTogglingWatcher}
        onPersistIssue={onPersistIssue}
        onUpdate={onUpdateIssue}
        onToggleWatcher={onToggleWatcher}
      />
    </div>
  );
}

export function ProjectIssuesPageContent({
  canUpdateIssue = false,
  currentUserId,
  members,
  project
}: ProjectIssuesPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = useMemo(() => getProjectIssuesPreview(project, members), [members, project]);
  const [issues, setIssues] = useState<ProjectIssuePreview[]>(preview.items);
  const assigneeOptions = useMemo<ProjectIssuePreview['assignees']>(() => {
    return buildIssueAssigneeOptions(
      members,
      issues.flatMap((issue) => issue.assignees)
    );
  }, [issues, members]);
  const fallbackIssue = issues[0] ?? preview.items[0];
  const currentUserLabel =
    members[0]?.displayName?.trim() ||
    (fallbackIssue ? getPrimaryAssignee(fallbackIssue)?.name : null) ||
    project.name;
  const [isDesktop, setIsDesktop] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false);
  const [isDesktopDetailsOpen, setIsDesktopDetailsOpen] = useState(false);
  const queryState = useMemo(() => parseProjectIssuesQueryParams(searchParams), [searchParams]);

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

  const replaceQueryState = (
    nextQuery: Partial<{
      filter: ProjectIssuesFilter;
      issue: string | undefined;
      labelId: string | undefined;
      search: string | undefined;
    }>
  ) => {
    const nextParams = toProjectIssuesSearchParams(
      {
        filter: nextQuery.filter ?? queryState.filter,
        issue: nextQuery.issue !== undefined ? nextQuery.issue : queryState.issue,
        labelId: nextQuery.labelId !== undefined ? nextQuery.labelId : queryState.labelId,
        projectId: queryState.projectId,
        projectScope: queryState.projectScope,
        search: nextQuery.search !== undefined ? nextQuery.search : queryState.search
      },
      searchParams
    );
    const next = nextParams.toString();
    const current = searchParams.toString();

    if (next !== current) {
      const href = next ? `${pathname}?${next}` : pathname;
      router.replace(href, { scroll: false });
    }
  };

  const filterOptions: Array<{ label: string; value: ProjectIssuesFilter }> = [
    { label: 'All', value: ProjectIssuesFilter.ALL },
    { label: 'Active', value: ProjectIssuesFilter.ACTIVE },
    { label: 'Backlog', value: ProjectIssuesFilter.BACKLOG },
    { label: 'Blocked', value: ProjectIssuesFilter.BLOCKED },
    { label: 'Done', value: ProjectIssuesFilter.DONE },
    { label: 'Mine', value: ProjectIssuesFilter.MINE }
  ];

  const filteredIssues = useMemo(() => {
    const normalizedQuery = queryState.search?.trim().toLowerCase() ?? '';

    return issues.filter((issue) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        issue.identifier.toLowerCase().includes(normalizedQuery) ||
        issue.title.toLowerCase().includes(normalizedQuery) ||
        issue.description.toLowerCase().includes(normalizedQuery) ||
        issue.labels.some((label) => label.toLowerCase().includes(normalizedQuery));

      return matchesQuery && matchesFilter(issue, queryState.filter, currentUserLabel);
    });
  }, [currentUserLabel, issues, queryState.filter, queryState.search]);

  const selectedIssue =
    filteredIssues.find((issue) => issue.id === queryState.issue) ??
    issues.find((issue) => issue.id === queryState.issue) ??
    null;
  const inProgressIssues = issues.filter(
    (issue) => issue.stage === ProjectIssueStage.IN_PROGRESS
  ).length;
  const blockedIssues = issues.filter((issue) => issue.stage === ProjectIssueStage.BLOCKED).length;
  const doneIssues = issues.filter((issue) => issue.stage === ProjectIssueStage.DONE).length;

  const updateIssue = (
    issueId: string,
    updater: (issue: ProjectIssuePreview) => ProjectIssuePreview
  ) => {
    setIssues((current) =>
      current.map((issue) => {
        if (issue.id !== issueId) {
          return issue;
        }

        const next = updater(issue);
        if (!canApplyInlineIssueUpdate(issue, next, { canUpdateIssue, currentUserId })) {
          return issue;
        }
        const mutation = buildInlineIssueMutation(Number(issueId), issue, next);
        if (!mutation) {
          return next;
        }

        const previous = issue;
        void mutation.request
          .then((updated) => {
            const mapped = mapIssueToPreview(updated, {
              members,
              projectLookup: new Map([[project.id, project]])
            });
            setIssues((existing) =>
              existing.map((candidate) => (candidate.id === issueId ? mapped : candidate))
            );
          })
          .catch((error) => {
            setIssues((existing) =>
              existing.map((candidate) => (candidate.id === issueId ? previous : candidate))
            );
            toast.error(mutation.errorTitle, {
              description: error instanceof Error ? error.message : 'Please try again.'
            });
          });

        return next;
      })
    );
  };

  const handleIssueSelect = (issueId: string) => {
    replaceQueryState({ issue: issueId });

    if (isDesktop) {
      setIsDesktopDetailsOpen(true);
    } else {
      setIsMobileDetailsOpen(true);
    }
  };

  const handleDesktopDetailsClose = () => {
    setIsDesktopDetailsOpen(false);
    replaceQueryState({ issue: undefined });
  };

  const handlePersistIssue = async (
    issueId: string,
    input: {
      dueAt?: string | null;
      estimate?: number | null;
    }
  ) => {
    if (!canUpdateIssue) {
      return;
    }

    const current = issues.find((candidate) => candidate.id === issueId);
    if (!current) {
      return;
    }

    try {
      const updated = await issuesApi.updateIssue(Number(issueId), {
        baseRevision: current.revision,
        ...input
      });
      const mapped = mapIssueToPreview(updated, {
        members,
        projectLookup: new Map([[project.id, project]])
      });
      setIssues((existing) =>
        existing.map((candidate) => (candidate.id === issueId ? mapped : candidate))
      );
    } catch (error) {
      toast.error('Failed to update issue', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      throw error;
    }
  };

  const handleCreateIssue = async (input: {
    title: string;
    descriptionMarkdown?: string;
    priority?: IssueDetail['priority'];
    projectId?: number;
  }) => {
    if (isCreatingIssue) {
      return;
    }

    setIsCreatingIssue(true);
    try {
      const created = await issuesApi.createIssue({
        ...input,
        projectId: Number(project.id)
      });
      const nextParams = toProjectIssuesSearchParams(
        getPostCreateProjectIssuesQueryState(queryState, String(project.id)),
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

  const getIssueHref = (issueId: string) => `/projects/${project.id}/issues/${issueId}`;

  return (
    <div className="w-full">
      <Card className={enterpriseCardVariants()}>
        <CardContent className="p-0">
          <div
            className={cn(
              'grid min-h-[720px]',
              isDesktopDetailsOpen
                ? 'xl:grid-cols-[minmax(0,1fr)_390px]'
                : 'xl:grid-cols-[minmax(0,1fr)]'
            )}
          >
            <div className="min-w-0 xl:border-r xl:border-border/70">
              <div className="border-b border-border/70 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 md:gap-4">
                  <WorkspaceStat
                    label="Total"
                    value={issues.length}
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

                <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="relative w-full xl:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={queryState.search ?? ''}
                      onChange={(event) =>
                        replaceQueryState({
                          search:
                            event.target.value.trim().length > 0 ? event.target.value : undefined,
                          issue: undefined
                        })
                      }
                      placeholder="Search issues, labels, or IDs"
                      className="pl-9"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/15 px-3 py-1.5 text-xs text-muted-foreground">
                      <ListFilter className="h-3.5 w-3.5" />
                      {filteredIssues.length} shown
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      onClick={() => setIsCreateDialogOpen(true)}
                      disabled={isCreatingIssue}
                    >
                      Create issue
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
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
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        queryState.filter === option.value
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-border/70 bg-muted/15 text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hidden grid-cols-[110px_minmax(0,1.9fr)_110px_110px_56px] gap-3 border-b border-border/70 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground md:grid">
                <span>Issue</span>
                <span>Title</span>
                <span>Status</span>
                <span>Priority</span>
                <span>Assignee</span>
              </div>

              <div className="divide-y divide-border/70">
                {filteredIssues.length > 0 ? (
                  filteredIssues.map((issue) => {
                    const isSelected = issue.id === selectedIssue?.id;

                    return (
                      <div
                        key={issue.id}
                        onClick={() => handleIssueSelect(issue.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleIssueSelect(issue.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-2 text-left transition-colors md:grid md:grid-cols-[110px_minmax(0,1.9fr)_110px_110px_56px] md:items-center',
                          isSelected
                            ? 'bg-primary/5 shadow-[inset_2px_0_0_0_hsl(var(--primary))]'
                            : 'hover:bg-muted/20',
                          'cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                        )}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            {getIssueStatusIcon(issue)}
                            <Link
                              href={getIssueHref(issue.id)}
                              onClick={(event) => event.stopPropagation()}
                              className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                            >
                              {issue.identifier}
                            </Link>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground md:hidden">
                            <span>{getAssigneeSummary(issue)}</span>
                            <span>•</span>
                            <span>{issue.updatedLabel}</span>
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {issue.title}
                              </p>
                              <ProjectIssueLabelChips labels={issue.labels} />
                            </div>
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground md:hidden" />
                          </div>
                          <div className="flex flex-wrap gap-1.5 md:hidden">
                            <InlineStatusEditor
                              issue={issue}
                              onUpdate={updateIssue}
                              disabled={!canUpdateIssue}
                              compact
                            />
                            <InlinePriorityEditor
                              issue={issue}
                              onUpdate={updateIssue}
                              disabled={!canUpdateIssue}
                              compact
                            />
                            {issue.labels.slice(0, 2).map((label) => (
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
                          <InlineStatusEditor
                            issue={issue}
                            onUpdate={updateIssue}
                            disabled={!canUpdateIssue}
                          />
                        </div>

                        <div className="hidden min-w-0 md:block">
                          <InlinePriorityEditor
                            issue={issue}
                            onUpdate={updateIssue}
                            disabled={!canUpdateIssue}
                          />
                        </div>

                        <div className="hidden md:block">
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <InlineAssigneeEditor
                                    align={IssueAssigneeMenuAlign.END}
                                    canManageAssignees={canUpdateIssue}
                                    currentUserId={currentUserId}
                                    issue={issue}
                                    onUpdate={updateIssue}
                                    options={assigneeOptions}
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{getAssigneeSummary(issue)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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

            {isDesktopDetailsOpen ? (
              <aside className="hidden h-[720px] xl:sticky xl:top-0 xl:block">
                <IssueDetailsPanel
                  assigneeOptions={assigneeOptions}
                  issue={selectedIssue}
                  issueHref={selectedIssue ? getIssueHref(selectedIssue.id) : undefined}
                  onClose={handleDesktopDetailsClose}
                  onPersistIssue={
                    selectedIssue
                      ? (input) => handlePersistIssue(selectedIssue.id, input)
                      : undefined
                  }
                  onUpdateIssue={updateIssue}
                  showCloseButton
                />
              </aside>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <IssueCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={handleCreateIssue}
        projects={[project]}
        defaultProjectId={project.id}
        allowOrganizationScope={false}
        isSubmitting={isCreatingIssue}
        description={`Create a new issue for ${project.name} before continuing in the full detail view.`}
      />

      <Dialog open={isMobileDetailsOpen} onOpenChange={setIsMobileDetailsOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] p-0 sm:max-w-xl xl:hidden">
          <DialogHeader className="border-b border-border/70 px-5 py-4">
            <DialogTitle>Issue details</DialogTitle>
            <DialogDescription>
              Inspect the selected issue without leaving the project queue.
            </DialogDescription>
          </DialogHeader>
          <IssueDetailsPanel
            assigneeOptions={assigneeOptions}
            issue={selectedIssue}
            issueHref={selectedIssue ? getIssueHref(selectedIssue.id) : undefined}
            onPersistIssue={
              selectedIssue ? (input) => handlePersistIssue(selectedIssue.id, input) : undefined
            }
            onUpdateIssue={updateIssue}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProjectIssueDetailPageContent({
  availableLabels,
  initialActivity,
  initialAttachments,
  canCreateIssue = false,
  canCreateComment = false,
  canDeleteIssue = false,
  canUpdateIssue = false,
  currentUserId,
  initialComments,
  initialLabels,
  initialRelations,
  initialSubtasks,
  initialWatchers,
  issue,
  members,
  project,
  relationCandidates,
  listHref = `/projects/${project.id}/issues`,
  issueHref = `/projects/${project.id}/issues/${issue.id}`
}: {
  availableLabels: IssueLabel[];
  initialActivity: IssueActivity[];
  initialAttachments: IssueAttachment[];
  canCreateIssue?: boolean;
  canCreateComment?: boolean;
  canDeleteIssue?: boolean;
  canUpdateIssue?: boolean;
  currentUserId: number;
  initialComments: IssueComment[];
  initialLabels: IssueLabel[];
  initialRelations: IssueRelation[];
  initialSubtasks: IssueListItem[];
  initialWatchers: IssueParticipant[];
  issue: ProjectIssuePreview;
  members: ProjectMember[];
  project: Project;
  relationCandidates: IssueListItem[];
  listHref?: string;
  issueHref?: string;
}) {
  const router = useRouter();
  const attachmentInputId = useId();
  const [currentIssue, setCurrentIssue] = useState<ProjectIssuePreview>(issue);
  const [activity, setActivity] = useState<IssueActivity[]>(() =>
    orderIssueActivityDesc(initialActivity)
  );
  const [attachments, setAttachments] = useState<IssueAttachment[]>(initialAttachments);
  const [comments, setComments] = useState<IssueComment[]>(() =>
    orderIssueCommentsDesc(initialComments)
  );
  const [currentLabels, setCurrentLabels] = useState<IssueLabel[]>(initialLabels);
  const [currentRelations, setCurrentRelations] = useState<IssueRelation[]>(initialRelations);
  const [subtasks, setSubtasks] = useState<IssueListItem[]>(initialSubtasks);
  const [labelOptions, setLabelOptions] = useState<IssueLabel[]>(availableLabels);
  const [watchers, setWatchers] = useState<IssueParticipant[]>(initialWatchers);
  const [commentDraft, setCommentDraft] = useState('');
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [titleValue, setTitleValue] = useState(issue.title);
  const [labelDraftName, setLabelDraftName] = useState('');
  const [labelDraftColor, setLabelDraftColor] = useState('#94a3b8');
  const [newLabelSelection, setNewLabelSelection] = useState('');
  const [newRelationTargetId, setNewRelationTargetId] = useState('');
  const [newRelationType, setNewRelationType] = useState<IssueRelation['relationType']>('related');
  const [isCreatingComment, setIsCreatingComment] = useState(false);
  const [isCreatingSubtask, setIsCreatingSubtask] = useState(false);
  const [isDeletingIssue, setIsDeletingIssue] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isUpdatingLabels, setIsUpdatingLabels] = useState(false);
  const [isUpdatingRelations, setIsUpdatingRelations] = useState(false);
  const [isTogglingWatcher, setIsTogglingWatcher] = useState(false);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const assigneeOptions = useMemo<ProjectIssuePreview['assignees']>(() => {
    return buildIssueAssigneeOptions(members, currentIssue.assignees);
  }, [currentIssue.assignees, members]);
  const issueHrefQuery = useMemo(() => {
    const queryIndex = issueHref.indexOf('?');
    return queryIndex >= 0 ? issueHref.slice(queryIndex) : '';
  }, [issueHref]);

  useEffect(() => {
    setTitleValue(currentIssue.title);
  }, [currentIssue.title]);

  useEffect(() => {
    const textarea = titleTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [titleValue]);

  const syncIssueState = (updated: IssueDetail) => {
    setCurrentIssue(
      mapIssueToPreview(updated, {
        members,
        projectLookup: new Map([[project.id, project]])
      })
    );
    setActivity(orderIssueActivityDesc(updated.activity));
    setComments(orderIssueCommentsDesc(updated.comments));
    setCurrentLabels(updated.labels);
    setCurrentRelations(updated.relations);
    setSubtasks(updated.subtasks);
    setWatchers(updated.watchers);
  };

  const updateSubtask = (
    issueId: string,
    updater: (issue: ProjectIssuePreview) => ProjectIssuePreview
  ) => {
    setSubtasks((current) =>
      current.map((subtask) => {
        if (String(subtask.id) !== issueId) {
          return subtask;
        }

        const previousPreview = mapIssueToPreview(subtask, {
          members,
          projectLookup: new Map([[project.id, project]])
        });
        const nextPreview = updater(previousPreview);

        if (
          !canApplyInlineIssueUpdate(previousPreview, nextPreview, {
            canUpdateIssue,
            currentUserId
          })
        ) {
          return subtask;
        }

        const mutation = buildInlineIssueMutation(Number(issueId), previousPreview, nextPreview);
        const optimisticSubtask = applyPreviewToSubtask(subtask, nextPreview);

        if (!mutation) {
          return optimisticSubtask;
        }

        const previousSubtask = subtask;
        void mutation.request
          .then((updated) => {
            setSubtasks((existing) =>
              existing.map((candidate) => (String(candidate.id) === issueId ? updated : candidate))
            );
          })
          .catch((error) => {
            setSubtasks((existing) =>
              existing.map((candidate) =>
                String(candidate.id) === issueId ? previousSubtask : candidate
              )
            );
            toast.error(mutation.errorTitle, {
              description: error instanceof Error ? error.message : 'Please try again.'
            });
          });

        return optimisticSubtask;
      })
    );
  };

  const updateIssue = (
    issueId: string,
    updater: (issue: ProjectIssuePreview) => ProjectIssuePreview
  ) => {
    if (issueId !== currentIssue.id) {
      return;
    }

    setCurrentIssue((existing) => {
      const next = updater(existing);

      if (!canApplyInlineIssueUpdate(existing, next, { canUpdateIssue, currentUserId })) {
        return existing;
      }

      const mutation = buildInlineIssueMutation(Number(issueId), existing, next);
      if (!mutation) {
        return next;
      }

      const previous = existing;
      void mutation.request
        .then((updated) => {
          syncIssueState(updated);
        })
        .catch((error) => {
          setCurrentIssue(previous);
          toast.error(mutation.errorTitle, {
            description: error instanceof Error ? error.message : 'Please try again.'
          });
        });

      return next;
    });
  };

  const handleDeleteIssue = async () => {
    if (!canDeleteIssue || isDeletingIssue) {
      return;
    }

    setIsDeletingIssue(true);
    try {
      await issuesApi.deleteIssue(Number(currentIssue.id));
      startTransition(() => {
        router.replace(listHref);
      });
    } catch (error) {
      toast.error('Failed to delete issue', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      setIsDeletingIssue(false);
      throw error;
    }
  };

  const handleCreateComment = async () => {
    if (!canCreateComment || isCreatingComment || commentDraft.trim().length === 0) {
      return;
    }

    setIsCreatingComment(true);
    try {
      const updated = await issuesApi.createIssueComment(Number(currentIssue.id), {
        bodyMarkdown: commentDraft.trim()
      });
      syncIssueState(updated);
      setCommentDraft('');
    } catch (error) {
      toast.error('Failed to add comment', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsCreatingComment(false);
    }
  };

  const handleAttachmentFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || isUploadingAttachment || !canUpdateIssue) {
      return;
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      toast.error('Attachment is too large', {
        description: 'Choose a file smaller than 10 MB.'
      });
      return;
    }

    const mimeType = file.type.trim() || 'application/octet-stream';
    const uploadInput: CreateIssueAttachmentUploadInput = {
      originalFilename: file.name,
      mimeType,
      byteSize: file.size,
      transport: 'api_proxy'
    };
    let reservedFileId: number | null = null;
    let uploadCompleted = false;

    setIsUploadingAttachment(true);

    try {
      const reservation = await issuesApi.createIssueAttachmentUpload(
        Number(currentIssue.id),
        uploadInput
      );
      reservedFileId = reservation.file.id;
      const uploadHeaders = new Headers(reservation.upload.headers ?? {});
      uploadHeaders.set('content-type', mimeType);
      uploadHeaders.set('content-length', String(file.size));

      const uploadResponse = await fetch(`/api/storage/uploads/${reservedFileId}/content`, {
        method: 'PUT',
        credentials: 'include',
        headers: uploadHeaders,
        body: file
      });

      const uploadPayload = await uploadResponse
        .json()
        .catch(() => ({ message: 'Failed to upload attachment bytes' }));
      if (!uploadResponse.ok) {
        throw new Error(
          uploadPayload && typeof uploadPayload === 'object' && 'message' in uploadPayload
            ? String((uploadPayload as { message?: unknown }).message ?? 'Upload failed')
            : 'Upload failed'
        );
      }
      uploadCompleted = true;

      const createdAttachment = await issuesApi.createIssueAttachment(Number(currentIssue.id), {
        fileId: reservedFileId
      });

      setAttachments((current) => [createdAttachment, ...current]);
      setCurrentIssue((current) => ({
        ...current,
        attachmentsCount: current.attachmentsCount + 1
      }));
      router.refresh();
      toast.success('Attachment uploaded');
    } catch (error) {
      if (reservedFileId !== null && uploadCompleted) {
        try {
          await fetch(`/api/storage/files/${reservedFileId}`, {
            method: 'DELETE',
            credentials: 'include'
          });
        } catch (cleanupError) {
          console.error('Failed to clean up unattached issue attachment file', cleanupError);
        }
      }
      toast.error('Attachment upload failed', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!canUpdateIssue || deletingAttachmentId !== null) {
      return;
    }

    setDeletingAttachmentId(attachmentId);
    try {
      await issuesApi.deleteIssueAttachment(Number(currentIssue.id), attachmentId);
      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
      setCurrentIssue((current) => ({
        ...current,
        attachmentsCount: Math.max(0, current.attachmentsCount - 1)
      }));
      router.refresh();
      toast.success('Attachment removed', {
        description: 'The file is scheduled for permanent deletion by retention cleanup.'
      });
    } catch (error) {
      toast.error('Failed to delete attachment', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const handleDownloadAttachment = async (attachment: IssueAttachment) => {
    if (attachment.fileId === null || downloadingAttachmentId !== null) {
      return;
    }

    setDownloadingAttachmentId(attachment.id);
    try {
      window.open(
        issuesApi.getIssueAttachmentDownloadPath(Number(currentIssue.id), attachment.id),
        '_blank',
        'noopener,noreferrer'
      );
    } catch (error) {
      toast.error('Failed to download attachment', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setDownloadingAttachmentId(null);
    }
  };

  const handleToggleWatcher = async () => {
    if (!canUpdateIssue || isTogglingWatcher) {
      return;
    }

    const isWatching = watchers.some((watcher) => watcher.userId === currentUserId);
    setIsTogglingWatcher(true);
    try {
      const updated = isWatching
        ? await issuesApi.removeIssueWatcher(Number(currentIssue.id), currentUserId)
        : await issuesApi.addIssueWatcher(Number(currentIssue.id), { userId: currentUserId });
      syncIssueState(updated);
    } catch (error) {
      toast.error(`Failed to ${isWatching ? 'stop watching' : 'watch'} issue`, {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsTogglingWatcher(false);
    }
  };

  const handlePersistIssue = async (input: UpdateIssueInput) => {
    if (!canUpdateIssue) {
      return;
    }

    try {
      const updated = await issuesApi.updateIssue(Number(currentIssue.id), {
        baseRevision: currentIssue.revision,
        ...input
      });
      syncIssueState(updated);
    } catch (error) {
      toast.error('Failed to update issue', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      throw error;
    }
  };

  const handleTitleBlur = async () => {
    const nextTitle = titleValue.trim();
    if (!canUpdateIssue || isSavingTitle) {
      return;
    }

    if (nextTitle.length === 0) {
      setTitleValue(currentIssue.title);
      return;
    }

    if (nextTitle === currentIssue.title) {
      return;
    }

    setIsSavingTitle(true);
    try {
      await handlePersistIssue({ title: nextTitle });
    } catch {
      setTitleValue(currentIssue.title);
      return;
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleAddLabel = async () => {
    if (!canUpdateIssue || isUpdatingLabels || !newLabelSelection) {
      return;
    }

    setIsUpdatingLabels(true);
    try {
      const updated = await issuesApi.addIssueLabel(Number(currentIssue.id), {
        labelId: Number(newLabelSelection)
      });
      syncIssueState(updated);
      setNewLabelSelection('');
    } catch (error) {
      toast.error('Failed to add label', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsUpdatingLabels(false);
    }
  };

  const handleRemoveLabel = async (labelId: number) => {
    if (!canUpdateIssue || isUpdatingLabels) {
      return;
    }

    setIsUpdatingLabels(true);
    try {
      const updated = await issuesApi.removeIssueLabel(Number(currentIssue.id), labelId);
      syncIssueState(updated);
    } catch (error) {
      toast.error('Failed to remove label', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsUpdatingLabels(false);
    }
  };

  const handleCreateLabel = async () => {
    if (!canUpdateIssue || isUpdatingLabels || labelDraftName.trim().length === 0) {
      return;
    }

    setIsUpdatingLabels(true);
    try {
      const createdLabel = await issuesApi.createIssueLabel({
        name: labelDraftName.trim(),
        color: labelDraftColor
      });
      setLabelOptions((current) =>
        current.some((label) => label.id === createdLabel.id) ? current : [...current, createdLabel]
      );
      const updated = await issuesApi.addIssueLabel(Number(currentIssue.id), {
        labelId: createdLabel.id
      });
      syncIssueState(updated);
      setLabelDraftName('');
      setNewLabelSelection('');
    } catch (error) {
      toast.error('Failed to create label', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsUpdatingLabels(false);
    }
  };

  const handleAddRelation = async () => {
    if (!canUpdateIssue || isUpdatingRelations || newRelationTargetId.length === 0) {
      return;
    }

    setIsUpdatingRelations(true);
    try {
      const updated = await issuesApi.createIssueRelation(Number(currentIssue.id), {
        targetIssueId: Number(newRelationTargetId),
        relationType: newRelationType
      });
      syncIssueState(updated);
      setNewRelationTargetId('');
      setNewRelationType('related');
    } catch (error) {
      toast.error('Failed to add relation', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsUpdatingRelations(false);
    }
  };

  const handleRemoveRelation = async (relationId: number) => {
    if (!canUpdateIssue || isUpdatingRelations) {
      return;
    }

    setIsUpdatingRelations(true);
    try {
      const updated = await issuesApi.deleteIssueRelation(Number(currentIssue.id), relationId);
      syncIssueState(updated);
    } catch (error) {
      toast.error('Failed to remove relation', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsUpdatingRelations(false);
    }
  };

  const handleCreateSubtask = async () => {
    if (!canCreateIssue || isCreatingSubtask || subtaskDraft.trim().length === 0) {
      return;
    }

    setIsCreatingSubtask(true);
    try {
      const projectIdValue = Number(project.id);
      const created = await issuesApi.createIssue({
        title: subtaskDraft.trim(),
        descriptionMarkdown: '',
        ...(Number.isFinite(projectIdValue) ? { projectId: projectIdValue } : {}),
        parentIssueId: Number(currentIssue.id)
      });
      setSubtasks((current) => [...current, created]);
      setCurrentIssue((existing) => ({
        ...existing,
        subtaskCount: existing.subtaskCount + 1
      }));
      setSubtaskDraft('');
    } catch (error) {
      toast.error('Failed to create subtask', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsCreatingSubtask(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-y-auto xl:overflow-hidden">
      <Card
        className={`${enterpriseCardVariants()} flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden`}
      >
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-h-0 min-w-0 flex-col border-b border-border/70 xl:border-b-0 xl:border-r xl:border-border/70">
              <div className="shrink-0 p-4">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      asChild
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                    >
                      <Link href={listHref}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back
                      </Link>
                    </Button>
                    <Link
                      href={issueHref}
                      className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    >
                      {currentIssue.identifier}
                    </Link>
                    <Badge
                      variant="outline"
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      title={project.name}
                      aria-label={getProjectBadgeAccessibleLabel(project)}
                    >
                      {getProjectBadgeLabel(project)}
                    </Badge>
                    <InlineStatusEditor
                      issue={currentIssue}
                      onUpdate={updateIssue}
                      disabled={!canUpdateIssue}
                    />
                    <IssueActionsMenu
                      canDeleteIssue={canDeleteIssue}
                      issueHref={issueHref}
                      issueIdentifier={currentIssue.identifier}
                      issueTitle={currentIssue.title}
                      isDeleting={isDeletingIssue}
                      onDeleteIssue={handleDeleteIssue}
                      showOpenIssue={false}
                      triggerLabel="Open issue detail actions"
                      variant="detail-header"
                    />
                  </div>
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
                      disabled={!canUpdateIssue}
                      className="field-sizing-content w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[20px] font-semibold leading-tight tracking-[-0.03em] text-foreground outline-hidden placeholder:text-muted-foreground/50"
                      placeholder="Untitled issue"
                      aria-label="Issue title"
                    />
                    {isSavingTitle ? (
                      <LoaderCircle className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-3 px-4 pb-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                <IssueDescriptionSection
                  canEdit={canUpdateIssue}
                  issue={currentIssue}
                  onSave={(nextDescriptionMarkdown) =>
                    handlePersistIssue({ descriptionMarkdown: nextDescriptionMarkdown })
                  }
                />

                <IssueSubtasksSection
                  canUpdateIssue={canUpdateIssue}
                  currentUserId={currentUserId}
                  createHrefQuery={issueHrefQuery}
                  isCreatingSubtask={isCreatingSubtask}
                  members={members}
                  onCreateSubtask={() => void handleCreateSubtask()}
                  onUpdateSubtask={updateSubtask}
                  onSubtaskDraftChange={setSubtaskDraft}
                  project={project}
                  subtaskDraft={subtaskDraft}
                  subtasks={subtasks}
                  canCreateSubtask={canCreateIssue}
                />

                <IssueAttachmentsSection
                  attachments={attachments}
                  downloadingAttachmentId={downloadingAttachmentId}
                  canDeleteAttachment={canUpdateIssue}
                  canUploadAttachment={canUpdateIssue}
                  deletingAttachmentId={deletingAttachmentId}
                  fileInputId={attachmentInputId}
                  isUploadingAttachment={isUploadingAttachment}
                  onDownloadAttachment={(attachment) => void handleDownloadAttachment(attachment)}
                  onDeleteAttachment={(attachmentId) => void handleDeleteAttachment(attachmentId)}
                  onFileChange={(event) => void handleAttachmentFileChange(event)}
                />

                <IssueConversationTabs
                  activity={activity}
                  canCreateComment={canCreateComment}
                  commentDraft={commentDraft}
                  comments={comments}
                  onCommentDraftChange={setCommentDraft}
                  onCreateComment={() => void handleCreateComment()}
                  isCreatingComment={isCreatingComment}
                />
              </div>
            </div>

            <aside className="min-w-0 border-t border-border/70 xl:flex xl:min-h-0 xl:flex-col xl:border-t-0 xl:overflow-hidden">
              <IssueSidebarSections
                availableLabels={labelOptions}
                issue={currentIssue}
                assigneeOptions={assigneeOptions}
                canUpdateIssue={canUpdateIssue}
                currentLabels={currentLabels}
                currentRelations={currentRelations}
                currentUserId={currentUserId}
                isTogglingWatcher={isTogglingWatcher}
                isUpdatingLabels={isUpdatingLabels}
                isUpdatingRelations={isUpdatingRelations}
                labelDraftColor={labelDraftColor}
                labelDraftName={labelDraftName}
                newLabelSelection={newLabelSelection}
                newRelationTargetId={newRelationTargetId}
                newRelationType={newRelationType}
                onAddLabel={() => void handleAddLabel()}
                onAddRelation={() => void handleAddRelation()}
                onCreateLabel={() => void handleCreateLabel()}
                onLabelColorChange={setLabelDraftColor}
                onLabelDraftChange={setLabelDraftName}
                onLabelSelectionChange={setNewLabelSelection}
                onPersistIssue={handlePersistIssue}
                onRelationTargetChange={setNewRelationTargetId}
                onRelationTypeChange={setNewRelationType}
                onRemoveRelation={(relationId) => void handleRemoveRelation(relationId)}
                onRemoveLabel={(labelId) => void handleRemoveLabel(labelId)}
                onUpdate={updateIssue}
                onToggleWatcher={() => void handleToggleWatcher()}
                relationCandidates={relationCandidates}
                watchers={watchers}
              />
            </aside>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

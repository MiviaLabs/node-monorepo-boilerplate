'use client';

import { AlertCircle, CheckCircle2, CircleDotDashed, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ProjectIssuePreview, ProjectIssueStatusTone } from '~/lib/issues/issue-preview-data';
import type { ProjectMember } from '~/types/project.types';

import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DropdownMenuCheckboxItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { Input } from '~/components/ui/input';
import { ProjectIssueStage } from '~/lib/issues/issue-preview-data';
import { cn } from '~/lib/utils';

function stopEventPropagation(event: { stopPropagation: () => void; preventDefault?: () => void }) {
  event.stopPropagation();
}

export const enum IssueAssigneeMenuAlign {
  START = 'start',
  CENTER = 'center',
  END = 'end'
}

export const ISSUE_STATUS_OPTIONS = [
  {
    value: 'backlog',
    stage: ProjectIssueStage.BACKLOG,
    tone: 'backlog' as ProjectIssueStatusTone,
    label: 'Backlog'
  },
  {
    value: 'in_progress',
    stage: ProjectIssueStage.IN_PROGRESS,
    tone: 'active' as ProjectIssueStatusTone,
    label: 'In progress'
  },
  {
    value: 'blocked',
    stage: ProjectIssueStage.BLOCKED,
    tone: 'blocked' as ProjectIssueStatusTone,
    label: 'Blocked'
  },
  {
    value: 'done',
    stage: ProjectIssueStage.DONE,
    tone: 'done' as ProjectIssueStatusTone,
    label: 'Done'
  }
] as const;

export const ISSUE_PRIORITY_OPTIONS = ['Urgent', 'High', 'Medium', 'Low'] as const;

export function getIssueToneClass(tone: ProjectIssueStatusTone): string {
  if (tone === 'blocked') {
    return 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  }

  if (tone === 'active') {
    return 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
  }

  if (tone === 'done') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }

  return 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

export function getPriorityClass(priorityLabel: string): string {
  if (priorityLabel === 'Urgent') {
    return 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  }

  if (priorityLabel === 'High') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }

  if (priorityLabel === 'Medium') {
    return 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
  }

  return 'border-border/70 bg-muted/30 text-muted-foreground';
}

export function getAssigneeSummary(issue: ProjectIssuePreview): string {
  if (issue.assignees.length === 0) {
    return 'Unassigned';
  }

  if (issue.assignees.length === 1) {
    return issue.assignees[0]?.name ?? 'Unassigned';
  }

  return `${issue.assignees.length} assignees`;
}

function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function toDueAtIso(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function formatIssueStoryPoints(estimate: number | null): string {
  return estimate === null ? 'No estimate' : `${estimate} SP`;
}

function getAssigneeTriggerLabel(issue: ProjectIssuePreview): string {
  if (issue.assignees.length === 0) {
    return 'Assign people';
  }

  if (issue.assignees.length === 1) {
    return 'Change assignee';
  }

  return `${issue.assignees.length} assignees`;
}

export function buildIssueAssigneeOptions(
  members: ProjectMember[],
  fallbackAssignees: ProjectIssuePreview['assignees'] = []
): ProjectIssuePreview['assignees'] {
  const fromMembers = members.map((member) => {
    const name = member.displayName?.trim() || `User ${member.userId}`;
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');

    return {
      avatarUrl: member.photoUrl ?? null,
      initials,
      name,
      userId: Number(member.userId)
    };
  });

  const merged = [...fallbackAssignees, ...fromMembers];
  return merged.filter(
    (option, index) => merged.findIndex((candidate) => candidate.userId === option.userId) === index
  );
}

export function AssigneeAvatarStack({
  assignees
}: {
  assignees: ProjectIssuePreview['assignees'];
}) {
  if (assignees.length === 0) {
    return (
      <div className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-dashed border-border/70 px-2 text-[10px] text-muted-foreground">
        +
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {assignees.slice(0, 3).map((assignee, index) => (
        <Avatar
          key={assignee.userId}
          className={cn('h-7 w-7 border border-background bg-muted', index > 0 ? '-ml-2' : '')}
        >
          <AvatarImage src={assignee.avatarUrl ?? undefined} alt={assignee.name} />
          <AvatarFallback className="bg-muted text-[9px] font-semibold">
            {assignee.initials}
          </AvatarFallback>
        </Avatar>
      ))}
      {assignees.length > 3 ? (
        <div className="-ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-background bg-muted text-[9px] font-semibold text-muted-foreground">
          +{assignees.length - 3}
        </div>
      ) : null}
    </div>
  );
}

export function getIssueStatusIcon(issue: Pick<ProjectIssuePreview, 'stage'>) {
  if (issue.stage === ProjectIssueStage.DONE) {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  }

  if (issue.stage === ProjectIssueStage.BLOCKED) {
    return <AlertCircle className="h-4 w-4 text-rose-500" />;
  }

  if (issue.stage === ProjectIssueStage.IN_PROGRESS) {
    return <CircleDotDashed className="h-4 w-4 text-sky-500" />;
  }

  return <CircleDotDashed className="h-4 w-4 text-muted-foreground" />;
}

function getIssueStatusValue(issue: ProjectIssuePreview) {
  return ISSUE_STATUS_OPTIONS.find((option) => option.stage === issue.stage)?.value ?? 'backlog';
}

export function InlineStatusEditor({
  disabled = false,
  issue,
  onUpdate,
  compact = false
}: {
  disabled?: boolean;
  issue: ProjectIssuePreview;
  onUpdate: (issueId: string, updater: (issue: ProjectIssuePreview) => ProjectIssuePreview) => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="focus-visible:outline-hidden"
          disabled={disabled}
          onClick={stopEventPropagation}
          onPointerDown={stopEventPropagation}
          onMouseDown={stopEventPropagation}
          onKeyDown={stopEventPropagation}
        >
          <Badge
            size="sm"
            className={cn(
              'rounded-full px-2 py-0.5 hover:opacity-90',
              compact ? 'text-[10px]' : '',
              getIssueToneClass(issue.tone)
            )}
          >
            {issue.statusLabel}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onClick={stopEventPropagation}
        onPointerDown={stopEventPropagation}
        onCloseAutoFocus={stopEventPropagation}
      >
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={getIssueStatusValue(issue)}
          onValueChange={(value) => {
            const option = ISSUE_STATUS_OPTIONS.find((item) => item.value === value);
            if (!option) return;
            onUpdate(issue.id, (current) => ({
              ...current,
              stage: option.stage,
              statusLabel: option.label,
              tone: option.tone
            }));
          }}
        >
          {ISSUE_STATUS_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InlinePriorityEditor({
  disabled = false,
  issue,
  onUpdate,
  compact = false
}: {
  disabled?: boolean;
  issue: ProjectIssuePreview;
  onUpdate: (issueId: string, updater: (issue: ProjectIssuePreview) => ProjectIssuePreview) => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="focus-visible:outline-hidden"
          disabled={disabled}
          onClick={stopEventPropagation}
          onPointerDown={stopEventPropagation}
          onMouseDown={stopEventPropagation}
          onKeyDown={stopEventPropagation}
        >
          <Badge
            size="sm"
            className={cn(
              'rounded-full px-2 py-0.5 hover:opacity-90',
              compact ? 'text-[10px]' : '',
              getPriorityClass(issue.priorityLabel)
            )}
          >
            {issue.priorityLabel}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onClick={stopEventPropagation}
        onPointerDown={stopEventPropagation}
        onCloseAutoFocus={stopEventPropagation}
      >
        <DropdownMenuLabel>Priority</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={issue.priorityLabel}
          onValueChange={(value) =>
            onUpdate(issue.id, (current) => ({
              ...current,
              priorityLabel: value
            }))
          }
        >
          {ISSUE_PRIORITY_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {option}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InlineAssigneeEditor({
  align = IssueAssigneeMenuAlign.START,
  canManageAssignees = false,
  currentUserId,
  disabled = false,
  issue,
  onUpdate,
  options,
  showLabel = false
}: {
  align?: IssueAssigneeMenuAlign;
  canManageAssignees?: boolean;
  currentUserId?: number;
  disabled?: boolean;
  issue: ProjectIssuePreview;
  onUpdate: (issueId: string, updater: (issue: ProjectIssuePreview) => ProjectIssuePreview) => void;
  options: ProjectIssuePreview['assignees'];
  showLabel?: boolean;
}) {
  const hasSelfAssignment = issue.assignees.some((assignee) => assignee.userId === currentUserId);
  const canUnassignSelf = hasSelfAssignment && currentUserId !== undefined;
  const canToggleOption = (optionUserId: number, checked: boolean) => {
    if (canManageAssignees) {
      return true;
    }

    return canUnassignSelf && checked && optionUserId === currentUserId;
  };
  const isEditorDisabled =
    disabled ||
    !options.some((option) =>
      canToggleOption(
        option.userId,
        issue.assignees.some((assignee) => assignee.userId === option.userId)
      )
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
          disabled={isEditorDisabled}
          onClick={stopEventPropagation}
          onPointerDown={stopEventPropagation}
          onMouseDown={stopEventPropagation}
          onKeyDown={stopEventPropagation}
        >
          <AssigneeAvatarStack assignees={issue.assignees} />
          {showLabel ? (
            <span className="text-xs text-muted-foreground">{getAssigneeTriggerLabel(issue)}</span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        onClick={stopEventPropagation}
        onPointerDown={stopEventPropagation}
        onCloseAutoFocus={stopEventPropagation}
      >
        <DropdownMenuLabel>Assignees</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => {
          const checked = issue.assignees.some((assignee) => assignee.userId === option.userId);

          return (
            <DropdownMenuCheckboxItem
              key={option.userId}
              checked={checked}
              disabled={!canToggleOption(option.userId, checked)}
              onCheckedChange={(nextChecked) =>
                onUpdate(issue.id, (current) => {
                  const existing = current.assignees.some(
                    (assignee) => assignee.userId === option.userId
                  );

                  if (nextChecked && !existing) {
                    return { ...current, assignees: [...current.assignees, option] };
                  }

                  if (!nextChecked && existing) {
                    return {
                      ...current,
                      assignees: current.assignees.filter(
                        (assignee) => assignee.userId !== option.userId
                      )
                    };
                  }

                  return current;
                })
              }
            >
              {option.name}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InlineIssueDeliveryEditor({
  canEdit = false,
  dueAt,
  dueLabel,
  estimate,
  onSave
}: {
  canEdit?: boolean;
  dueAt: string | Date | null | undefined;
  dueLabel: string;
  estimate: number | null;
  onSave: (input: { dueAt?: string | null; estimate?: number | null }) => Promise<void>;
}) {
  const currentDueValue = toDateInputValue(dueAt);
  const currentEstimateValue = estimate === null ? '' : String(estimate);
  const [dueValue, setDueValue] = useState(currentDueValue);
  const [estimateValue, setEstimateValue] = useState(currentEstimateValue);
  const [isSavingDueAt, setIsSavingDueAt] = useState(false);
  const [isSavingEstimate, setIsSavingEstimate] = useState(false);

  useEffect(() => {
    setDueValue(currentDueValue);
  }, [currentDueValue]);

  useEffect(() => {
    setEstimateValue(currentEstimateValue);
  }, [currentEstimateValue]);

  const persistDueAt = async (nextDueAt: string | null) => {
    if (!canEdit || isSavingDueAt) {
      return;
    }

    const currentDueAt = currentDueValue === '' ? null : toDueAtIso(currentDueValue);
    const normalizedNextDueAt = nextDueAt === null ? null : toDueAtIso(nextDueAt);
    if (currentDueAt === normalizedNextDueAt) {
      return;
    }

    setIsSavingDueAt(true);
    try {
      await onSave({ dueAt: normalizedNextDueAt });
    } catch {
      setDueValue(currentDueValue);
    } finally {
      setIsSavingDueAt(false);
    }
  };

  const persistEstimate = async (nextEstimate: number | null) => {
    if (!canEdit || isSavingEstimate) {
      return;
    }

    if (estimate === nextEstimate) {
      return;
    }

    setIsSavingEstimate(true);
    try {
      await onSave({ estimate: nextEstimate });
    } catch {
      setEstimateValue(currentEstimateValue);
    } finally {
      setIsSavingEstimate(false);
    }
  };

  const handleEstimateBlur = async () => {
    if (!canEdit || isSavingEstimate) {
      return;
    }

    const normalized = estimateValue.trim();
    if (normalized.length === 0) {
      setEstimateValue(currentEstimateValue);
      return;
    }

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEstimateValue(currentEstimateValue);
      return;
    }

    await persistEstimate(parsed);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Delivery
        </p>
        {isSavingDueAt || isSavingEstimate ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <LoaderCircle className="h-3 w-3 animate-spin" />
            Saving
          </span>
        ) : null}
      </div>
      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
        <div className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-xs text-muted-foreground">Due date</span>
          {canEdit ? (
            <Input
              type="date"
              value={dueValue}
              onChange={(event) => setDueValue(event.target.value)}
              onBlur={() => {
                void persistDueAt(dueValue === '' ? null : dueValue);
              }}
              className="h-8 bg-background text-xs"
            />
          ) : (
            <span className="text-xs text-foreground">{dueLabel}</span>
          )}
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={dueValue.length === 0 || isSavingDueAt}
              onClick={() => {
                setDueValue('');
                void persistDueAt(null);
              }}
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-xs text-muted-foreground">Story points</span>
          {canEdit ? (
            <div className="relative">
              <Input
                type="number"
                min={0}
                step={1}
                value={estimateValue}
                onChange={(event) => setEstimateValue(event.target.value)}
                onBlur={() => {
                  void handleEstimateBlur();
                }}
                className="h-8 bg-background pr-10 text-xs"
                placeholder="No estimate"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-[11px] text-muted-foreground">
                SP
              </span>
            </div>
          ) : (
            <span className="text-xs text-foreground">{formatIssueStoryPoints(estimate)}</span>
          )}
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={estimate === null || isSavingEstimate}
              onClick={() => {
                setEstimateValue('');
                void persistEstimate(null);
              }}
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

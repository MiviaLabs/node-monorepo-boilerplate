'use client';

import { Copy, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ComponentProps } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';

const enum IssueActionsMenuVariant {
  DETAIL_HEADER = 'detail-header',
  SIDEBAR_HEADER = 'sidebar-header',
  LIST_ROW = 'list-row'
}

const enum IssueActionsMenuAlign {
  START = 'start',
  END = 'end'
}

interface IssueActionsMenuProps {
  align?: ComponentProps<typeof DropdownMenuContent>['align'];
  canDelete?: boolean;
  canDeleteIssue?: boolean;
  deleteLabel?: string;
  isDeleting?: boolean;
  issueHref: string;
  issueIdentifier: string;
  issueTitle: string;
  onDelete?: (() => Promise<void> | void) | undefined;
  onDeleteIssue?: (() => Promise<void> | void) | undefined;
  openLabel?: string;
  showOpenIssue?: boolean;
  triggerLabel?: string;
  variant?: string;
}

function getDeleteTitle(issueTitle: string, issueIdentifier: string): string {
  const normalizedTitle = issueTitle.trim();
  return normalizedTitle.length > 0 ? `Delete ${normalizedTitle}?` : `Delete ${issueIdentifier}?`;
}

export function IssueActionsMenu({
  align = IssueActionsMenuAlign.END,
  canDelete,
  canDeleteIssue = false,
  deleteLabel = 'Delete issue',
  isDeleting = false,
  issueHref,
  issueIdentifier,
  issueTitle,
  onDelete,
  onDeleteIssue,
  openLabel = 'Open issue',
  showOpenIssue = true,
  triggerLabel = 'Open issue actions',
  variant = IssueActionsMenuVariant.DETAIL_HEADER
}: IssueActionsMenuProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const canOpenIssue = showOpenIssue && issueHref.length > 0;
  const resolvedCanDelete = canDelete ?? canDeleteIssue;
  const resolvedOnDelete = onDelete ?? onDeleteIssue;
  const hasActions = canOpenIssue || (resolvedCanDelete && Boolean(resolvedOnDelete));

  if (!hasActions) {
    return null;
  }

  const handleCopyLink = async () => {
    try {
      const absoluteHref = issueHref.startsWith('http')
        ? issueHref
        : `${window.location.origin}${issueHref}`;
      await navigator.clipboard.writeText(absoluteHref);
      toast.success('Issue link copied');
    } catch (error) {
      toast.error('Failed to copy issue link', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    }
  };

  const handleDelete = async () => {
    if (!resolvedOnDelete || isDeleting) {
      return;
    }

    try {
      await resolvedOnDelete();
      setIsDeleteDialogOpen(false);
    } catch {
      return;
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={
              variant === IssueActionsMenuVariant.DETAIL_HEADER
                ? 'h-7 px-2 text-xs'
                : 'h-7 w-7 p-0 text-muted-foreground hover:bg-accent hover:text-foreground'
            }
          >
            <span className="sr-only">{triggerLabel}</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-44">
          <DropdownMenuLabel>Issue actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {canOpenIssue ? (
            <DropdownMenuItem asChild>
              <Link href={issueHref}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {openLabel}
              </Link>
            </DropdownMenuItem>
          ) : null}
          {canOpenIssue ? (
            <DropdownMenuItem onSelect={() => void handleCopyLink()}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </DropdownMenuItem>
          ) : null}
          {resolvedCanDelete && resolvedOnDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={isDeleting}
                onSelect={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleteLabel}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>{getDeleteTitle(issueTitle, issueIdentifier)}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-muted-foreground">
              <p>This removes the issue from the workspace and cannot be undone.</p>
              <p>Deleting this issue also deletes all comments, attached files, and subtasks.</p>
              <p>Attached files will be scheduled for permanent storage purge.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : deleteLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

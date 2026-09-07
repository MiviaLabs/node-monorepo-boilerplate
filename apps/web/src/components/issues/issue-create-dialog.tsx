'use client';

import { useEffect, useMemo, useState } from 'react';

import type { CreateIssueInput, IssuePriorityValue } from '~/types/issue.types';
import type { Project } from '~/types/project.types';

import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';

interface IssueCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateIssueInput) => Promise<void>;
  projects: Project[];
  defaultProjectId?: string;
  allowOrganizationScope?: boolean;
  isSubmitting?: boolean;
  title?: string;
  description?: string;
}

const DEFAULT_PRIORITY: IssuePriorityValue = 'medium';
const ORGANIZATION_SCOPE_VALUE = '__organization__';

function getInitialProjectValue(defaultProjectId?: string) {
  return defaultProjectId?.trim() || ORGANIZATION_SCOPE_VALUE;
}

export function IssueCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  projects,
  defaultProjectId,
  allowOrganizationScope = true,
  isSubmitting = false,
  title = 'Create issue',
  description = 'Capture the issue first, then continue in the full detail view.'
}: IssueCreateDialogProps) {
  const sortedProjects = useMemo(
    () => [...projects].sort((left, right) => left.name.localeCompare(right.name)),
    [projects]
  );
  const [projectValue, setProjectValue] = useState(getInitialProjectValue(defaultProjectId));
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [priority, setPriority] = useState<IssuePriorityValue>(DEFAULT_PRIORITY);
  const canUseOrganizationScope = allowOrganizationScope || sortedProjects.length === 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    setProjectValue(
      defaultProjectId?.trim() ||
        (!allowOrganizationScope && sortedProjects[0]?.id
          ? sortedProjects[0].id
          : ORGANIZATION_SCOPE_VALUE)
    );
    setIssueTitle('');
    setIssueDescription('');
    setPriority(DEFAULT_PRIORITY);
  }, [allowOrganizationScope, defaultProjectId, open, sortedProjects]);

  const trimmedTitle = issueTitle.trim();
  const canSubmit = trimmedTitle.length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    await onSubmit({
      title: trimmedTitle,
      descriptionMarkdown: issueDescription.trim(),
      priority,
      ...(projectValue !== ORGANIZATION_SCOPE_VALUE ? { projectId: Number(projectValue) } : {})
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) {
          return;
        }

        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="issue-create-title">Title</Label>
            <Input
              id="issue-create-title"
              value={issueTitle}
              onChange={(event) => setIssueTitle(event.target.value)}
              placeholder="Summarize the issue"
              maxLength={255}
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="issue-create-project">Scope</Label>
              <Select value={projectValue} onValueChange={setProjectValue}>
                <SelectTrigger id="issue-create-project">
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  {canUseOrganizationScope ? (
                    <SelectItem value={ORGANIZATION_SCOPE_VALUE}>Organization</SelectItem>
                  ) : null}
                  {sortedProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="issue-create-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as IssuePriorityValue)}
              >
                <SelectTrigger id="issue-create-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="issue-create-description">Description</Label>
            <Textarea
              id="issue-create-description"
              value={issueDescription}
              onChange={(event) => setIssueDescription(event.target.value)}
              placeholder="Add enough context so the next person can act on it."
              className="min-h-[120px]"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? 'Creating...' : 'Create issue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

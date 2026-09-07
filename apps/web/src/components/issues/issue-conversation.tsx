'use client';

import type { IssueActivity, IssueComment } from '~/types/issue.types';

import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Textarea } from '~/components/ui/textarea';
import {
  formatIssueActivitySummary,
  formatIssueActivityTimeLabel
} from '~/lib/issues/issue-activity-presenter';

function getCommentAuthor(comment: IssueComment): string {
  return comment.authorDisplayName?.trim() || `User ${comment.authorUserId}`;
}

function getInitials(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'NA'
  );
}

function formatCommentTimeLabel(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function getActivityActor(entry: IssueActivity): string {
  if (entry.actorDisplayName?.trim()) {
    return entry.actorDisplayName.trim();
  }

  if (entry.actorUserId !== null) {
    return `User ${entry.actorUserId}`;
  }

  return 'System';
}

function CompactIssueRecentActivitySection({ activity }: { activity: IssueActivity[] }) {
  return (
    <div className="space-y-1.5">
      {activity.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-2.5 rounded-md px-1.5 py-1 text-[13px] leading-5"
        >
          <Avatar className="h-6 w-6 border border-border/60">
            <AvatarImage src={entry.actorPhotoUrl ?? undefined} alt={getActivityActor(entry)} />
            <AvatarFallback className="bg-muted text-[9px] font-semibold">
              {getInitials(getActivityActor(entry))}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-5 text-foreground">
              {formatIssueActivitySummary(entry)}
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {formatIssueActivityTimeLabel(entry, new Date())}
            </p>
          </div>
        </div>
      ))}
      {activity.length === 0 ? (
        <p className="px-1.5 text-[12px] text-muted-foreground">No activity yet.</p>
      ) : null}
    </div>
  );
}

function CompactIssueCommentsSection({
  canCreateComment,
  commentDraft,
  comments,
  isCreatingComment,
  onCommentDraftChange,
  onCreateComment
}: {
  canCreateComment: boolean;
  commentDraft: string;
  comments: IssueComment[];
  isCreatingComment: boolean;
  onCommentDraftChange: (value: string) => void;
  onCreateComment: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="divide-y divide-border/50 rounded-lg border border-border/60 bg-muted/5">
        {comments.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-muted-foreground">No comments yet.</p>
        ) : (
          comments.map((comment) => {
            const author = getCommentAuthor(comment);

            return (
              <div key={comment.id} className="px-3 py-2.5">
                <div className="flex items-start gap-2.5">
                  <Avatar className="h-6 w-6 border border-border/60">
                    <AvatarImage src={comment.authorPhotoUrl ?? undefined} alt={author} />
                    <AvatarFallback className="bg-muted text-[9px] font-semibold">
                      {getInitials(author)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="text-[12px] font-medium leading-5 text-foreground">{author}</p>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {formatCommentTimeLabel(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-foreground/90">
                      {comment.bodyMarkdown}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-lg border border-dashed border-border/60 bg-muted/5 p-2.5">
        <div className="space-y-2">
          <Textarea
            placeholder="Write a comment"
            className="min-h-[72px] resize-y border-border/60 bg-background/80 text-[13px] leading-5"
            value={commentDraft}
            onChange={(event) => onCommentDraftChange(event.target.value)}
            disabled={!canCreateComment || isCreatingComment}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Markdown supported
            </p>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={onCreateComment}
              disabled={!canCreateComment || isCreatingComment || commentDraft.trim().length === 0}
            >
              Comment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompactIssueConversationTabs({
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
    <section className="rounded-lg border border-border/60 bg-background/95 p-2.5">
      <Tabs defaultValue="comments">
        <div className="flex items-center justify-between gap-2">
          <TabsList className="h-7 bg-muted/60 p-0.5">
            <TabsTrigger value="comments" className="h-6 px-2 text-[11px]">
              Comments {comments.length}
            </TabsTrigger>
            <TabsTrigger value="activity" className="h-6 px-2 text-[11px]">
              Activity {activity.length}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="comments" className="mt-3">
          <CompactIssueCommentsSection
            canCreateComment={canCreateComment}
            commentDraft={commentDraft}
            comments={comments}
            isCreatingComment={isCreatingComment}
            onCommentDraftChange={onCommentDraftChange}
            onCreateComment={onCreateComment}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-3">
          <CompactIssueRecentActivitySection activity={activity} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

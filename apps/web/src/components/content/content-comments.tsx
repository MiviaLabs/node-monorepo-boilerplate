'use client';

import { Loader2, MessageSquareMore, Send, Trash2 } from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

import type { ContentComment } from '~/types/content.types';

import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { contentApi } from '~/lib/api/content-api';

function getCommentAuthorLabel(comment: ContentComment): string {
  return comment.authorDisplayName?.trim() || `User ${comment.authorUserId}`;
}

function getInitials(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
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

function compareCommentsDesc(left: ContentComment, right: ContentComment): number {
  const leftTime = new Date(left.createdAt).getTime();
  const rightTime = new Date(right.createdAt).getTime();

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return right.id - left.id;
}

function upsertCommentDesc(
  comments: ContentComment[],
  nextComment: ContentComment
): ContentComment[] {
  const withoutComment = comments.filter((comment) => comment.id !== nextComment.id);
  return [...withoutComment, nextComment].sort(compareCommentsDesc);
}

export function ContentComments({
  canCreateComment = false,
  contentEntryId,
  initialComments = []
}: {
  canCreateComment?: boolean;
  contentEntryId: number | null;
  initialComments?: ContentComment[];
}) {
  const composerId = useId();
  const [comments, setComments] = useState<ContentComment[]>(initialComments);
  const [commentDraft, setCommentDraft] = useState('');
  const [isLoading, setIsLoading] = useState(initialComments.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setComments(initialComments);
    setLoadError(null);
    setIsLoading(initialComments.length === 0);
    setIsRefreshing(false);
    setDeletingCommentId(null);
  }, [contentEntryId, initialComments]);

  useEffect(() => {
    if (contentEntryId === null) {
      return;
    }

    let cancelled = false;

    const loadComments = async () => {
      if (initialComments.length === 0) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setLoadError(null);

      try {
        const nextComments = await contentApi.listContentComments(contentEntryId);
        if (cancelled) {
          return;
        }

        setComments(nextComments);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load comments.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void loadComments();

    return () => {
      cancelled = true;
    };
  }, [contentEntryId, initialComments.length]);

  const refreshComments = async () => {
    if (contentEntryId === null) {
      return;
    }

    setIsRefreshing(true);
    setLoadError(null);

    try {
      const nextComments = await contentApi.listContentComments(contentEntryId);
      setComments(nextComments);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to refresh comments.');
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  };

  const handleCreateComment = async () => {
    if (contentEntryId === null || !canCreateComment || isSubmitting) {
      return;
    }

    const bodyMarkdown = commentDraft.trim();
    if (bodyMarkdown.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    const tempId = -Date.now();
    const optimisticComment: ContentComment = {
      id: tempId,
      contentEntryId,
      authorUserId: 0,
      authorDisplayName: 'You',
      authorPhotoUrl: null,
      bodyMarkdown,
      createdAt: timestamp,
      updatedAt: timestamp,
      canDelete: false
    };

    setIsSubmitting(true);
    setCommentDraft('');
    setComments((current) => [optimisticComment, ...current]);

    try {
      const created = await contentApi.createContentComment(contentEntryId, { bodyMarkdown });
      setComments((current) => [created, ...current.filter((comment) => comment.id !== tempId)]);
      toast.success('Comment added');
      await refreshComments();
    } catch (error) {
      setComments((current) => current.filter((comment) => comment.id !== tempId));
      setCommentDraft(bodyMarkdown);
      toast.error('Failed to add comment', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (comment: ContentComment) => {
    if (contentEntryId === null || deletingCommentId !== null || !comment.canDelete) {
      return;
    }

    setDeletingCommentId(comment.id);
    setComments((current) => current.filter((entry) => entry.id !== comment.id));

    try {
      await contentApi.deleteContentComment(contentEntryId, comment.id);
      toast.success('Comment deleted');
      await refreshComments();
    } catch (error) {
      setComments((current) => upsertCommentDesc(current, comment));
      toast.error('Failed to delete comment', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setDeletingCommentId(null);
    }
  };

  if (contentEntryId === null) {
    return null;
  }

  return (
    <section className="border-t border-border/70 pt-6">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.01em] text-foreground">
              <MessageSquareMore className="h-4 w-4 text-muted-foreground" />
              Comments
            </h2>
            <p className="text-[11px] text-muted-foreground">Page discussion, newest first.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Refreshing
            </span>
          ) : null}
          <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {comments.length}
          </span>
        </div>
      </div>

      <div className="space-y-4 py-4">
        {loadError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-muted-foreground">
            {loadError}
          </div>
        ) : null}

        <div className="space-y-1.5">
          {isLoading ? (
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-3 text-[12px] text-muted-foreground">
              Loading comments...
            </div>
          ) : comments.length > 0 ? (
            <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-muted/3">
              {comments.map((comment) => {
                const author = getCommentAuthorLabel(comment);
                const isDeleting = deletingCommentId === comment.id;

                return (
                  <article key={comment.id} className="px-3 py-2.5 sm:px-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-7 w-7 border border-border/60">
                        <AvatarImage src={comment.authorPhotoUrl ?? undefined} alt={author} />
                        <AvatarFallback className="bg-muted text-[9px] font-semibold">
                          {getInitials(author)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="text-[12px] font-medium text-foreground">{author}</p>
                          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            {formatCommentTimeLabel(comment.createdAt)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap wrap-break-word text-[13px] leading-5 text-foreground/90">
                          {comment.bodyMarkdown}
                        </p>
                      </div>
                      {comment.canDelete ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                          disabled={isDeleting}
                          onClick={() => {
                            void handleDeleteComment(comment);
                          }}
                        >
                          {isDeleting ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/5 px-3 py-4 text-[12px] text-muted-foreground">
              No comments yet.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/3 px-3 py-3 sm:px-4">
          <div className="space-y-2">
            <label
              htmlFor={composerId}
              className="block text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
            >
              Add comment
            </label>
            <Textarea
              id={composerId}
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Share a note, decision, or follow-up..."
              className="min-h-[80px] resize-y border-border/60 bg-background text-[13px] leading-5"
              disabled={!canCreateComment || isSubmitting}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Markdown supported
              </p>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => {
                  void handleCreateComment();
                }}
                disabled={!canCreateComment || isSubmitting || commentDraft.trim().length === 0}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                Comment
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

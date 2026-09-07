import type { ContentDocNode } from '~/components/content/content-types';

import { buildContentMarkdown } from '~/lib/content/content-entry-adapter';

const CONTENT_SLUG_MAX_LENGTH = 255;

function trimSlugEdgeHyphens(value: string): string {
  return value.replace(/^-+|-+$/g, '');
}

export function normalizeContentSlug(value: string): string {
  const normalized = trimSlugEdgeHyphens(
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
  ).slice(0, CONTENT_SLUG_MAX_LENGTH);

  return trimSlugEdgeHyphens(normalized) || 'untitled';
}

export function buildContentSaveInput(input: {
  baseRevision: string;
  body: ContentDocNode;
  pageId: string;
  currentSlug: string;
  slugValue?: string;
  title: string;
}): {
  baseRevision: string;
  contentMarkdown: string;
  currentSlug: string;
  pageId: string;
  slug: string;
  title: string;
} {
  const normalizedTitle = input.title.trim() || 'Untitled';
  const nextSlug =
    input.slugValue !== undefined ? normalizeContentSlug(input.slugValue) : input.currentSlug;

  return {
    baseRevision: input.baseRevision,
    pageId: input.pageId,
    currentSlug: input.currentSlug,
    title: normalizedTitle,
    slug: nextSlug,
    contentMarkdown: buildContentMarkdown(normalizedTitle, input.body)
  };
}

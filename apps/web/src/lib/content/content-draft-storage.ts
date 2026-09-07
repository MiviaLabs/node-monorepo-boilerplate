import type { ContentDocNode } from '~/components/content/content-types';

const CONTENT_DRAFT_STORAGE_PREFIX = 'content-draft:';
const CONTENT_DRAFT_STORAGE_VERSION = 1;

export type StoredContentDraft = {
  version: 1;
  pageId: string;
  title: string;
  body: ContentDocNode;
  baseRevision: string;
  currentSlug: string;
  slugValue?: string;
  hasExplicitSlugOverride: boolean;
  snapshot: string;
  savedAt: string;
};

function getContentDraftStorageKey(pageId: string): string {
  return `${CONTENT_DRAFT_STORAGE_PREFIX}${pageId}`;
}

export function readStoredContentDraft(pageId: string): StoredContentDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawDraft = window.localStorage.getItem(getContentDraftStorageKey(pageId));

  if (!rawDraft) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawDraft) as Partial<StoredContentDraft>;

    if (
      parsed.version !== CONTENT_DRAFT_STORAGE_VERSION ||
      parsed.pageId !== pageId ||
      typeof parsed.title !== 'string' ||
      typeof parsed.baseRevision !== 'string' ||
      typeof parsed.currentSlug !== 'string' ||
      typeof parsed.snapshot !== 'string' ||
      typeof parsed.savedAt !== 'string' ||
      typeof parsed.hasExplicitSlugOverride !== 'boolean' ||
      !parsed.body ||
      typeof parsed.body !== 'object'
    ) {
      window.localStorage.removeItem(getContentDraftStorageKey(pageId));
      return null;
    }

    if (
      parsed.slugValue !== undefined &&
      parsed.slugValue !== null &&
      typeof parsed.slugValue !== 'string'
    ) {
      window.localStorage.removeItem(getContentDraftStorageKey(pageId));
      return null;
    }

    return {
      version: CONTENT_DRAFT_STORAGE_VERSION,
      pageId,
      title: parsed.title,
      body: parsed.body as ContentDocNode,
      baseRevision: parsed.baseRevision,
      currentSlug: parsed.currentSlug,
      slugValue: parsed.slugValue ?? undefined,
      hasExplicitSlugOverride: parsed.hasExplicitSlugOverride,
      snapshot: parsed.snapshot,
      savedAt: parsed.savedAt
    };
  } catch {
    window.localStorage.removeItem(getContentDraftStorageKey(pageId));
    return null;
  }
}

export function writeStoredContentDraft(draft: Omit<StoredContentDraft, 'version'>): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    getContentDraftStorageKey(draft.pageId),
    JSON.stringify({
      ...draft,
      version: CONTENT_DRAFT_STORAGE_VERSION
    } satisfies StoredContentDraft)
  );
}

export function clearStoredContentDraft(pageId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getContentDraftStorageKey(pageId));
}

export function shouldRestoreStoredContentDraft(input: {
  storedDraft: StoredContentDraft | null;
  currentSnapshot: string | null;
}): boolean {
  return (
    input.storedDraft !== null &&
    input.currentSnapshot !== null &&
    input.storedDraft.snapshot !== input.currentSnapshot
  );
}

import { getProjectIssuesSavedViewState } from '../projects/project-issues-query-params';

import type { ProjectIssuesQueryState } from '../projects/project-issues-query-params';

const SAVED_ISSUE_VIEWS_STORAGE_PREFIX = 'issues-saved-views:';
const SAVED_ISSUE_VIEWS_STORAGE_VERSION = 1;
const MAX_SAVED_ISSUE_VIEWS = 12;

export type SavedIssueView = {
  id: string;
  name: string;
  query: ProjectIssuesQueryState;
  createdAt: string;
  updatedAt: string;
};

type StoredSavedIssueViews = {
  version: 1;
  scope: string;
  views: SavedIssueView[];
};

function getSavedIssueViewsStorageKey(scope: string): string {
  return `${SAVED_ISSUE_VIEWS_STORAGE_PREFIX}${scope}`;
}

function isValidSavedIssueView(value: unknown): value is SavedIssueView {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const view = value as Partial<SavedIssueView>;

  return (
    typeof view.id === 'string' &&
    typeof view.name === 'string' &&
    typeof view.createdAt === 'string' &&
    typeof view.updatedAt === 'string' &&
    !!view.query &&
    typeof view.query === 'object'
  );
}

function normalizeSavedIssueViews(views: SavedIssueView[]): SavedIssueView[] {
  return views
    .filter(isValidSavedIssueView)
    .map((view) => ({
      ...view,
      name: view.name.trim(),
      query: getProjectIssuesSavedViewState(view.query)
    }))
    .filter((view) => view.name.length > 0)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_SAVED_ISSUE_VIEWS);
}

export function readSavedIssueViews(scope: string): SavedIssueView[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const rawValue = window.localStorage.getItem(getSavedIssueViewsStorageKey(scope));

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredSavedIssueViews>;

    if (
      parsed.version !== SAVED_ISSUE_VIEWS_STORAGE_VERSION ||
      parsed.scope !== scope ||
      !Array.isArray(parsed.views)
    ) {
      window.localStorage.removeItem(getSavedIssueViewsStorageKey(scope));
      return [];
    }

    return normalizeSavedIssueViews(parsed.views);
  } catch {
    window.localStorage.removeItem(getSavedIssueViewsStorageKey(scope));
    return [];
  }
}

export function writeSavedIssueViews(scope: string, views: SavedIssueView[]): SavedIssueView[] {
  if (typeof window === 'undefined') {
    return views;
  }

  const normalizedViews = normalizeSavedIssueViews(views);
  const payload: StoredSavedIssueViews = {
    version: SAVED_ISSUE_VIEWS_STORAGE_VERSION,
    scope,
    views: normalizedViews
  };

  window.localStorage.setItem(getSavedIssueViewsStorageKey(scope), JSON.stringify(payload));

  return normalizedViews;
}

export function upsertSavedIssueView(input: {
  scope: string;
  name: string;
  query: ProjectIssuesQueryState;
  existingId?: string;
}): SavedIssueView[] {
  const nextName = input.name.trim();

  if (nextName.length === 0) {
    return readSavedIssueViews(input.scope);
  }

  const now = new Date().toISOString();
  const currentViews = readSavedIssueViews(input.scope);
  const existingView = input.existingId
    ? currentViews.find((view) => view.id === input.existingId)
    : undefined;
  const nextView: SavedIssueView = {
    id: existingView?.id ?? `saved-view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: nextName,
    query: getProjectIssuesSavedViewState(input.query),
    createdAt: existingView?.createdAt ?? now,
    updatedAt: now
  };

  return writeSavedIssueViews(input.scope, [
    nextView,
    ...currentViews.filter((view) => view.id !== nextView.id)
  ]);
}

export function deleteSavedIssueView(scope: string, viewId: string): SavedIssueView[] {
  return writeSavedIssueViews(
    scope,
    readSavedIssueViews(scope).filter((view) => view.id !== viewId)
  );
}

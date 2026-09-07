import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteSavedIssueView,
  readSavedIssueViews,
  upsertSavedIssueView
} from './saved-issue-views';
import {
  ProjectIssuesFilter,
  ProjectIssuesProjectScope
} from '../projects/project-issues-query-params';

describe('saved issue views', () => {
  const scope = 'tenant-123';
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        }
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves and restores tenant-scoped issue views', () => {
    upsertSavedIssueView({
      scope,
      name: 'Release triage',
      query: {
        filter: ProjectIssuesFilter.BLOCKED,
        issue: 'ISSUE-9',
        labelId: '3',
        projectId: '42',
        projectScope: ProjectIssuesProjectScope.CONTEXT,
        search: 'release'
      }
    });

    expect(readSavedIssueViews(scope)).toEqual([
      expect.objectContaining({
        name: 'Release triage',
        query: {
          filter: ProjectIssuesFilter.BLOCKED,
          issue: undefined,
          labelId: '3',
          projectId: '42',
          projectScope: ProjectIssuesProjectScope.CONTEXT,
          search: 'release'
        }
      })
    ]);
  });

  it('replaces malformed storage payloads with an empty state', () => {
    storage.set('issues-saved-views:tenant-123', '{"version":1,"scope":"tenant-123","views":{}}');

    expect(readSavedIssueViews(scope)).toEqual([]);
    expect(storage.get('issues-saved-views:tenant-123')).toBeUndefined();
  });

  it('deletes saved views by id', () => {
    const saved = upsertSavedIssueView({
      scope,
      name: 'My queue',
      query: {
        filter: ProjectIssuesFilter.MINE,
        issue: undefined,
        labelId: undefined,
        projectId: undefined,
        projectScope: ProjectIssuesProjectScope.ALL,
        search: undefined
      }
    })[0];

    expect(saved).toBeDefined();
    if (!saved) {
      throw new Error('Expected saved view to exist');
    }
    expect(deleteSavedIssueView(scope, saved.id)).toEqual([]);
  });
});

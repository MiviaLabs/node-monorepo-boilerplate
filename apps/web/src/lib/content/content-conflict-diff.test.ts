import { describe, expect, it } from 'vitest';

import {
  buildStructuredContentConflictDiff,
  ContentConflictDiffKind,
  summarizeStructuredContentConflictDiff
} from './content-conflict-diff';

describe('content conflict diff', () => {
  it('builds grouped added, removed, and unchanged segments', () => {
    const segments = buildStructuredContentConflictDiff(
      '# Plan\nKeep this\nAdd this\nFinal line',
      '# Plan\nKeep this\nRemove this\nFinal line'
    );

    expect(segments).toEqual([
      { kind: ContentConflictDiffKind.Unchanged, lines: ['# Plan', 'Keep this'] },
      { kind: ContentConflictDiffKind.Added, lines: ['Add this'] },
      { kind: ContentConflictDiffKind.Removed, lines: ['Remove this'] },
      { kind: ContentConflictDiffKind.Unchanged, lines: ['Final line'] }
    ]);
  });

  it('summarizes changed blocks and line counts', () => {
    const summary = summarizeStructuredContentConflictDiff([
      { kind: ContentConflictDiffKind.Unchanged, lines: ['same'] },
      { kind: ContentConflictDiffKind.Added, lines: ['one', 'two'] },
      { kind: ContentConflictDiffKind.Removed, lines: ['three'] }
    ]);

    expect(summary).toEqual({
      addedLines: 2,
      removedLines: 1,
      changedBlocks: 2
    });
  });
});

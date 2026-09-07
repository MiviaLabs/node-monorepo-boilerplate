export const enum ContentConflictDiffKind {
  Added = 'added',
  Removed = 'removed',
  Unchanged = 'unchanged'
}

export type ContentConflictDiffSegment = {
  kind: ContentConflictDiffKind;
  lines: string[];
};

export type ContentConflictDiffSummary = {
  addedLines: number;
  removedLines: number;
  changedBlocks: number;
};

function buildLcsTable(localLines: string[], serverLines: string[]): number[][] {
  const table = Array.from({ length: serverLines.length + 1 }, () =>
    Array.from({ length: localLines.length + 1 }, () => 0)
  );

  for (let serverIndex = serverLines.length - 1; serverIndex >= 0; serverIndex -= 1) {
    for (let localIndex = localLines.length - 1; localIndex >= 0; localIndex -= 1) {
      const nextServerRow = table[serverIndex + 1];
      const currentRow = table[serverIndex];

      if (!nextServerRow || !currentRow) {
        throw new Error('Failed to build content conflict diff table.');
      }

      currentRow[localIndex] =
        serverLines[serverIndex] === localLines[localIndex]
          ? 1 + (nextServerRow[localIndex + 1] ?? 0)
          : Math.max(nextServerRow[localIndex] ?? 0, currentRow[localIndex + 1] ?? 0);
    }
  }

  return table;
}

export function buildStructuredContentConflictDiff(
  localContentMarkdown: string,
  serverContentMarkdown: string
): ContentConflictDiffSegment[] {
  const localLines = localContentMarkdown.split('\n');
  const serverLines = serverContentMarkdown.split('\n');
  const lcs = buildLcsTable(localLines, serverLines);
  const segments: ContentConflictDiffSegment[] = [];

  const appendLine = (kind: ContentConflictDiffKind, line: string) => {
    const current = segments[segments.length - 1];

    if (current?.kind === kind) {
      current.lines.push(line);
      return;
    }

    segments.push({ kind, lines: [line] });
  };

  let localIndex = 0;
  let serverIndex = 0;

  while (localIndex < localLines.length && serverIndex < serverLines.length) {
    const localLine = localLines[localIndex];
    const serverLine = serverLines[serverIndex];
    const currentServerRow = lcs[serverIndex];
    const nextServerRow = lcs[serverIndex + 1];

    if (
      localLine === undefined ||
      serverLine === undefined ||
      currentServerRow === undefined ||
      nextServerRow === undefined
    ) {
      throw new Error('Failed to build content conflict diff.');
    }

    if (localLine === serverLine) {
      appendLine(ContentConflictDiffKind.Unchanged, localLine);
      localIndex += 1;
      serverIndex += 1;
      continue;
    }

    if ((currentServerRow[localIndex + 1] ?? 0) >= (nextServerRow[localIndex] ?? 0)) {
      appendLine(ContentConflictDiffKind.Added, localLine);
      localIndex += 1;
      continue;
    }

    appendLine(ContentConflictDiffKind.Removed, serverLine);
    serverIndex += 1;
  }

  while (localIndex < localLines.length) {
    const localLine = localLines[localIndex];

    if (localLine === undefined) {
      throw new Error('Failed to append local content diff line.');
    }

    appendLine(ContentConflictDiffKind.Added, localLine);
    localIndex += 1;
  }

  while (serverIndex < serverLines.length) {
    const serverLine = serverLines[serverIndex];

    if (serverLine === undefined) {
      throw new Error('Failed to append server content diff line.');
    }

    appendLine(ContentConflictDiffKind.Removed, serverLine);
    serverIndex += 1;
  }

  return segments;
}

export function summarizeStructuredContentConflictDiff(
  segments: ContentConflictDiffSegment[]
): ContentConflictDiffSummary {
  return segments.reduce<ContentConflictDiffSummary>(
    (summary, segment) => ({
      addedLines:
        summary.addedLines +
        (segment.kind === ContentConflictDiffKind.Added ? segment.lines.length : 0),
      removedLines:
        summary.removedLines +
        (segment.kind === ContentConflictDiffKind.Removed ? segment.lines.length : 0),
      changedBlocks:
        summary.changedBlocks + (segment.kind === ContentConflictDiffKind.Unchanged ? 0 : 1)
    }),
    {
      addedLines: 0,
      removedLines: 0,
      changedBlocks: 0
    }
  );
}

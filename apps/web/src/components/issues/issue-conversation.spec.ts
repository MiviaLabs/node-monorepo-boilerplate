import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readSource() {
  const fs = await import('node:fs/promises');
  return fs.readFile(path.join(__dirname, 'issue-conversation.tsx'), 'utf-8');
}

describe('issue conversation component', () => {
  it('uses a compact shared conversation layout for comments and activity', async () => {
    const source = await readSource();

    expect(source).toContain('export function CompactIssueConversationTabs(');
    expect(source).toContain('TabsTrigger value="comments"');
    expect(source).toContain('TabsTrigger value="activity"');
    expect(source).toContain('Markdown supported');
    expect(source).toContain('rounded-lg border border-border/60 bg-background/95 p-2.5');
    expect(source).toContain('min-h-[72px]');
    expect(source).toContain('text-[13px] leading-5');
    expect(source).toContain('divide-y divide-border/50');
    expect(source).toContain('AvatarImage src={comment.authorPhotoUrl ?? undefined}');
    expect(source).toContain('AvatarImage src={entry.actorPhotoUrl ?? undefined}');
  });
});

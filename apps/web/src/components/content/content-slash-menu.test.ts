import { describe, expect, it } from 'vitest';

import {
  filterSlashCommandItems,
  getSlashCommandMatch,
  SLASH_COMMAND_ITEMS
} from './content-slash-menu';

describe('content slash menu helpers', () => {
  it('matches slash commands at the start of a block or after whitespace', () => {
    expect(getSlashCommandMatch('/hea', 4)).toEqual({ from: 0, to: 4, query: 'hea' });
    expect(getSlashCommandMatch('Before /todo', 12)).toEqual({ from: 7, to: 12, query: 'todo' });
  });

  it('ignores slash-like text that should not open the block menu', () => {
    expect(getSlashCommandMatch('https://example.com', 19)).toBeNull();
    expect(getSlashCommandMatch('word/heading', 12)).toBeNull();
    expect(getSlashCommandMatch('/two words', 10)).toBeNull();
  });

  it('filters slash commands by label, description, and keywords', () => {
    expect(filterSlashCommandItems('todo').map((item) => item.id)).toEqual(['task-list']);
    expect(filterSlashCommandItems('separator').map((item) => item.id)).toEqual(['divider']);
    expect(filterSlashCommandItems('diagram').map((item) => item.id)).toEqual(['mermaid']);
    expect(filterSlashCommandItems('toc').map((item) => item.id)).toEqual(['table-of-contents']);
    expect(filterSlashCommandItems('').length).toBe(SLASH_COMMAND_ITEMS.length);
  });
});

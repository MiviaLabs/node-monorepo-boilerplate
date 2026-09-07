export const SLASH_COMMAND_ITEMS = [
  {
    id: 'text',
    label: 'Text',
    description: 'Start writing with a plain paragraph.',
    keywords: ['paragraph', 'text', 'plain', 'body']
  },
  {
    id: 'heading-1',
    label: 'Heading 1',
    description: 'Large section heading.',
    keywords: ['h1', 'heading', 'title']
  },
  {
    id: 'heading-2',
    label: 'Heading 2',
    description: 'Medium section heading.',
    keywords: ['h2', 'heading', 'subtitle']
  },
  {
    id: 'heading-3',
    label: 'Heading 3',
    description: 'Compact section heading.',
    keywords: ['h3', 'heading']
  },
  {
    id: 'heading-4',
    label: 'Heading 4',
    description: 'Small heading for dense notes.',
    keywords: ['h4', 'heading']
  },
  {
    id: 'table-of-contents',
    label: 'Table of contents',
    description: 'Insert a live list of headings with anchor links.',
    keywords: ['toc', 'table', 'contents', 'outline', 'anchors']
  },
  {
    id: 'bullets',
    label: 'Bulleted list',
    description: 'Create an unordered list.',
    keywords: ['bullet', 'list', 'unordered']
  },
  {
    id: 'numbered-list',
    label: 'Numbered list',
    description: 'Create a step-by-step list.',
    keywords: ['numbered', 'ordered', 'list', 'steps']
  },
  {
    id: 'task-list',
    label: 'To-do list',
    description: 'Track tasks with checkboxes.',
    keywords: ['todo', 'task', 'checkbox', 'checklist']
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Highlight a quote or callout.',
    keywords: ['quote', 'blockquote', 'callout']
  },
  {
    id: 'code-block',
    label: 'Code block',
    description: 'Insert a formatted code block.',
    keywords: ['code', 'snippet', 'pre']
  },
  {
    id: 'mermaid',
    label: 'Mermaid',
    description: 'Insert a diagram block with code, preview, and split views.',
    keywords: ['mermaid', 'diagram', 'flowchart', 'graph']
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Insert a horizontal separator.',
    keywords: ['divider', 'separator', 'rule', 'line']
  }
] as const;

export type SlashCommandId = (typeof SLASH_COMMAND_ITEMS)[number]['id'];

export interface SlashCommandMatch {
  from: number;
  query: string;
  to: number;
}

export function filterSlashCommandItems(query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [...SLASH_COMMAND_ITEMS];
  }

  return SLASH_COMMAND_ITEMS.filter((item) => {
    const haystack = [item.label, item.description, ...item.keywords].join(' ').toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function getSlashCommandMatch(
  textBeforeCursor: string,
  selectionFrom: number
): SlashCommandMatch | null {
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBeforeCursor);

  if (!match) {
    return null;
  }

  const fullMatch = match[0];
  const slashOffsetInMatch = fullMatch.startsWith('/') ? 0 : 1;
  const slashIndex = (match.index ?? 0) + slashOffsetInMatch;

  return {
    from: selectionFrom - (textBeforeCursor.length - slashIndex),
    to: selectionFrom,
    query: match[1] ?? ''
  };
}

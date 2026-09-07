import { Schema } from '@tiptap/pm/model';
import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer
} from 'prosemirror-markdown';

import type {
  ContentDocument,
  ContentDocNode,
  ContentTextNode
} from '~/components/content/content-types';

import {
  CONTENT_TOC_SENTINEL,
  createUniqueHeadingAnchor,
  extractHeadingAnchor
} from '~/components/content/content-heading-anchors';

const SUPPORTED_MARKS = new Set(['bold', 'italic', 'link', 'code', 'underline']);

const contentMarkdownSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    blockquote: { content: 'block+', group: 'block', defining: true },
    horizontalRule: { group: 'block' },
    tableOfContents: { group: 'block', atom: true },
    heading: {
      attrs: { level: { default: 1 }, anchorId: { default: null } },
      content: 'inline*',
      group: 'block',
      defining: true
    },
    codeBlock: {
      attrs: { language: { default: null } },
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true
    },
    bulletList: {
      attrs: { bullet: { default: '-' } },
      content: 'listItem+',
      group: 'block'
    },
    orderedList: {
      attrs: { order: { default: 1 } },
      content: 'listItem+',
      group: 'block'
    },
    listItem: {
      content: 'paragraph block*',
      defining: true
    },
    taskList: {
      content: 'taskItem+',
      group: 'block'
    },
    taskItem: {
      attrs: { checked: { default: false } },
      content: 'paragraph block*',
      defining: true
    },
    text: { group: 'inline' },
    hardBreak: {
      inline: true,
      group: 'inline',
      selectable: false
    }
  },
  marks: {
    bold: {},
    italic: {},
    link: {
      attrs: {
        href: {},
        title: { default: null }
      },
      inclusive: false
    },
    code: {},
    underline: {}
  }
});

const markdownParser = new MarkdownParser(contentMarkdownSchema, defaultMarkdownParser.tokenizer, {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'listItem' },
  bullet_list: {
    block: 'bulletList',
    getAttrs: (token) => ({ bullet: token.markup || '-' })
  },
  ordered_list: {
    block: 'orderedList',
    getAttrs: (token) => ({
      order: Number.parseInt(token.attrGet('start') || '1', 10) || 1
    })
  },
  heading: {
    block: 'heading',
    getAttrs: (token) => ({ level: Number.parseInt(token.tag.slice(1), 10) || 1 })
  },
  code_block: { block: 'codeBlock' },
  fence: {
    block: 'codeBlock',
    getAttrs: (token) => ({ language: token.info || null })
  },
  hr: { node: 'horizontalRule' },
  hardbreak: { node: 'hardBreak' },
  em: { mark: 'italic' },
  strong: { mark: 'bold' },
  link: {
    mark: 'link',
    getAttrs: (token) => ({
      href: token.attrGet('href') ?? '',
      title: token.attrGet('title') ?? null
    })
  },
  code_inline: { mark: 'code' }
});

const markdownSerializer = new MarkdownSerializer(
  {
    blockquote: defaultMarkdownSerializer.nodes.blockquote!,
    paragraph: defaultMarkdownSerializer.nodes.paragraph!,
    heading(state, node) {
      const level = Number(node.attrs.level ?? 1);
      state.write(`${state.repeat('#', level)} `);
      state.renderInline(node);
      if (node.attrs.anchorId) {
        state.write(` {#${node.attrs.anchorId as string}}`);
      }
      state.closeBlock(node);
    },
    horizontalRule: defaultMarkdownSerializer.nodes.horizontal_rule!,
    tableOfContents(state, node) {
      state.write(CONTENT_TOC_SENTINEL);
      state.closeBlock(node);
    },
    bulletList(state, node) {
      state.renderList(node, '  ', () => `${node.attrs.bullet ?? '-'} `);
    },
    orderedList(state, node) {
      const start = node.attrs.order ?? 1;
      const maxWidth = String(start + node.childCount - 1).length;
      const space = state.repeat(' ', maxWidth + 2);
      state.renderList(node, space, (index) => {
        const current = String(start + index);
        return `${state.repeat(' ', maxWidth - current.length)}${current}. `;
      });
    },
    listItem: defaultMarkdownSerializer.nodes.list_item!,
    taskList(state, node) {
      state.renderList(node, '  ', (index) => {
        const item = node.child(index);
        return item.attrs.checked ? '- [x] ' : '- [ ] ';
      });
    },
    taskItem(state, node) {
      state.renderContent(node);
    },
    codeBlock(state, node) {
      state.write(`\`\`\`${node.attrs.language ?? ''}`.trimEnd());
      state.ensureNewLine();
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write('```');
      state.closeBlock(node);
    },
    hardBreak: defaultMarkdownSerializer.nodes.hard_break!,
    text: defaultMarkdownSerializer.nodes.text!
  },
  {
    bold: defaultMarkdownSerializer.marks.strong!,
    italic: defaultMarkdownSerializer.marks.em!,
    link: defaultMarkdownSerializer.marks.link!,
    code: defaultMarkdownSerializer.marks.code!,
    underline: {
      open: '<u>',
      close: '</u>',
      mixable: true,
      expelEnclosingWhitespace: true
    }
  }
);

function cloneTextNode(node: ContentTextNode): ContentTextNode {
  return {
    text: node.text,
    type: 'text',
    ...(node.marks
      ? {
          marks: node.marks
            .filter((mark) => SUPPORTED_MARKS.has(mark.type))
            .map((mark) => ({ ...mark }))
        }
      : {})
  };
}

function isTextNode(node: ContentDocNode | ContentTextNode): node is ContentTextNode {
  return 'text' in node;
}

function cloneNode(node: ContentDocNode): ContentDocNode {
  return {
    type: node.type,
    ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
    ...(node.content
      ? {
          content: node.content.map((child) =>
            isTextNode(child) ? cloneTextNode(child) : cloneNode(child)
          )
        }
      : {})
  };
}

function stripTrailingText(
  content: Array<ContentDocNode | ContentTextNode>,
  trailingText: string
): Array<ContentDocNode | ContentTextNode> {
  if (!trailingText) {
    return content;
  }

  let remaining = trailingText.length;

  for (let index = content.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const child = content[index];

    if (!child || !isTextNode(child)) {
      continue;
    }

    if (child.text.length <= remaining) {
      remaining -= child.text.length;
      child.text = '';
      continue;
    }

    child.text = child.text.slice(0, child.text.length - remaining);
    remaining = 0;
  }

  return content.filter((child) => !isTextNode(child) || child.text.length > 0);
}

function normalizeHeadingNode(node: ContentDocNode, usedAnchors: Set<string>): ContentDocNode {
  const clonedContent = node.content?.map((child) =>
    isTextNode(child) ? cloneTextNode(child) : normalizeNode(child, usedAnchors)
  );
  const headingText = (clonedContent ?? [])
    .map((child) => (isTextNode(child) ? child.text : ''))
    .join('');
  const extracted = extractHeadingAnchor(headingText);
  const anchorId = createUniqueHeadingAnchor(
    typeof node.attrs?.anchorId === 'string' ? node.attrs.anchorId : extracted.anchorId,
    extracted.text,
    usedAnchors
  );

  const trimmedContent =
    clonedContent && headingText !== extracted.text
      ? stripTrailingText(clonedContent, headingText.slice(extracted.text.length))
      : clonedContent;

  return {
    type: 'heading',
    attrs: {
      ...(node.attrs ?? {}),
      anchorId
    },
    ...(trimmedContent ? { content: trimmedContent } : {})
  };
}

function normalizeNode(node: ContentDocNode, usedAnchors: Set<string>): ContentDocNode {
  if (node.type === 'heading') {
    return normalizeHeadingNode(node, usedAnchors);
  }

  const clonedContent = node.content?.map((child) =>
    isTextNode(child) ? cloneTextNode(child) : normalizeNode(child, usedAnchors)
  );

  if (node.type === 'paragraph' && clonedContent?.length === 1) {
    const firstChild = clonedContent[0];

    if (firstChild && isTextNode(firstChild) && firstChild.text.trim() === CONTENT_TOC_SENTINEL) {
      return { type: 'tableOfContents' };
    }
  }

  return {
    type: node.type,
    ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
    ...(clonedContent ? { content: clonedContent } : {})
  };
}

function convertBulletListToTaskList(node: ContentDocNode): ContentDocNode {
  const convertedContent = node.content?.map((child) =>
    isTextNode(child) ? cloneTextNode(child) : convertBulletListToTaskList(child)
  );

  if (node.type !== 'bulletList' || !convertedContent || convertedContent.length === 0) {
    return {
      type: node.type,
      ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
      ...(convertedContent ? { content: convertedContent } : {})
    };
  }

  const maybeItems = convertedContent.filter(
    (child): child is ContentDocNode => !isTextNode(child)
  );
  const canConvert = maybeItems.every((item) => {
    const firstBlock = item.content?.[0];
    const firstInline = !firstBlock || isTextNode(firstBlock) ? null : firstBlock.content?.[0];
    return (
      item.type === 'listItem' &&
      firstBlock &&
      !isTextNode(firstBlock) &&
      firstBlock.type === 'paragraph' &&
      firstInline &&
      isTextNode(firstInline) &&
      /^\[(?: |x|X)\]\s+/.test(firstInline.text)
    );
  });

  if (!canConvert) {
    return {
      type: node.type,
      ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
      content: convertedContent
    };
  }

  return {
    type: 'taskList',
    content: maybeItems.map((item) => {
      const firstBlock = item.content?.[0] as ContentDocNode;
      const firstInline = firstBlock.content?.[0] as ContentTextNode;
      const checked = /^\[(?:x|X)\]\s+/.test(firstInline.text);
      const nextInline: ContentTextNode = {
        ...firstInline,
        text: firstInline.text.replace(/^\[(?: |x|X)\]\s+/, '')
      };

      return {
        type: 'taskItem',
        attrs: { checked },
        content: [
          {
            ...firstBlock,
            content: [nextInline, ...(firstBlock.content?.slice(1) ?? [])]
          },
          ...(item.content?.slice(1) ?? [])
        ]
      };
    })
  };
}

function normalizeMarkdownDoc(doc: ContentDocNode): ContentDocNode {
  return convertBulletListToTaskList(normalizeNode(doc, new Set<string>()));
}

function convertTaskListToBulletList(node: ContentDocNode): ContentDocNode {
  const convertedContent = node.content?.map((child) =>
    isTextNode(child) ? cloneTextNode(child) : convertTaskListToBulletList(child)
  );

  if (node.type === 'tableOfContents') {
    return { type: 'tableOfContents' };
  }

  if (node.type !== 'taskList' || !convertedContent) {
    return {
      type: node.type,
      ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
      ...(convertedContent ? { content: convertedContent } : {})
    };
  }

  return {
    type: 'bulletList',
    attrs: { bullet: '-' },
    content: convertedContent.map((child) => {
      if (isTextNode(child) || child.type !== 'taskItem') {
        return child as ContentDocNode;
      }

      const firstBlock = child.content?.[0];

      if (!firstBlock || isTextNode(firstBlock) || firstBlock.type !== 'paragraph') {
        return {
          type: 'listItem',
          content: child.content as ContentDocNode[] | undefined
        };
      }

      const prefix = child.attrs?.checked ? '[x] ' : '[ ] ';
      const firstInline = firstBlock.content?.[0];
      const nextFirstInline: ContentTextNode = {
        type: 'text',
        text: `${prefix}${firstInline && isTextNode(firstInline) ? firstInline.text : ''}`,
        ...(firstInline && isTextNode(firstInline) && firstInline.marks
          ? { marks: firstInline.marks }
          : {})
      };

      return {
        type: 'listItem',
        content: [
          {
            ...firstBlock,
            content: [nextFirstInline, ...(firstBlock.content?.slice(1) ?? [])]
          },
          ...(child.content?.slice(1) ?? [])
        ]
      };
    })
  };
}

function createEmptyDoc(): ContentDocNode {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }]
  };
}

export function parseMarkdownToContentDoc(markdown: string): ContentDocNode {
  const parsed = markdownParser.parse(markdown).toJSON() as ContentDocNode;
  return normalizeMarkdownDoc(parsed);
}

export function getContentDocument(content: ContentDocument): ContentDocNode {
  if (typeof content === 'string') {
    return parseMarkdownToContentDoc(content);
  }

  return normalizeMarkdownDoc(cloneNode(content));
}

export function getContentDocumentText(content: ContentDocument): string {
  const doc = getContentDocument(content);
  const parts: string[] = [];

  function visit(node: ContentDocNode | ContentTextNode) {
    if (isTextNode(node)) {
      parts.push(node.text);
      return;
    }

    node.content?.forEach(visit);
  }

  visit(doc);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function extractContentTitleAndBody(content: ContentDocument, fallbackTitle: string) {
  const doc = getContentDocument(content);
  const firstNode = doc.content?.[0];

  if (
    firstNode &&
    !isTextNode(firstNode) &&
    firstNode.type === 'heading' &&
    firstNode.attrs?.level === 1
  ) {
    const title = getContentDocumentText(firstNode).trim() || fallbackTitle;
    const remaining = doc.content?.slice(1) ?? [];

    return {
      title,
      body:
        remaining.length > 0
          ? {
              type: 'doc',
              content: remaining
            }
          : createEmptyDoc()
    };
  }

  return {
    title: fallbackTitle,
    body: doc
  };
}

export function serializeContentDocToMarkdown(content: ContentDocument): string {
  const normalized = convertTaskListToBulletList(getContentDocument(content));
  return markdownSerializer.serialize(contentMarkdownSchema.nodeFromJSON(normalized)).trim();
}

import type {
  ContentDocNode,
  ContentPage,
  ContentTextNode
} from '~/components/content/content-types';
import type { ContentEntry, ContentSidebarEntry } from '~/types/content.types';

import {
  getContentDocument,
  getContentDocumentText,
  serializeContentDocToMarkdown
} from '~/lib/projects/project-content-markdown';

const enum ContentScope {
  ORGANIZATION = 'organization',
  PROJECT = 'project'
}

function excerptFromMarkdown(contentMarkdown: string): string {
  const text = getContentDocumentText(contentMarkdown);
  if (!text) {
    return 'Untitled page.';
  }

  return text.length > 120 ? `${text.slice(0, 117).trimEnd()}...` : text;
}

function buildCover(scope: ContentScope): ContentPage['cover'] {
  if (scope === ContentScope.PROJECT) {
    return {
      accentClassName: 'from-sky-500/15 via-sky-500/5 to-transparent',
      eyebrow: 'Project content',
      gradientClassName: 'from-sky-500/12 via-transparent to-transparent'
    };
  }

  return {
    accentClassName: 'from-slate-500/15 via-slate-500/5 to-transparent',
    eyebrow: 'Organization content',
    gradientClassName: 'from-slate-500/12 via-transparent to-transparent'
  };
}

export function contentEntryToPage(entry: ContentEntry, scope: ContentScope): ContentPage {
  const updatedByLabel = entry.updatedByDisplayName?.trim() ?? `User ${entry.updatedBy}`;

  return {
    id: String(entry.id),
    slug: entry.slug,
    title: entry.title,
    icon: '📝',
    parentId: entry.parentId === null ? null : String(entry.parentId),
    description: excerptFromMarkdown(entry.contentMarkdown),
    updatedLabel: new Date(entry.updatedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    }),
    contributorCount: 1,
    tags: [scope === ContentScope.PROJECT ? 'Project' : 'Organization'],
    searchText: getContentDocumentText(entry.contentMarkdown),
    updatedByLabel,
    updatedByPhotoUrl: entry.updatedByPhotoUrl,
    cover: buildCover(scope),
    versions: [
      {
        id: `${entry.id}-current`,
        label: 'Current',
        createdAt: new Date(entry.updatedAt).toLocaleString(),
        author: updatedByLabel,
        summary: 'Current version',
        isCurrent: true,
        revision: entry.revision ?? new Date(entry.updatedAt).toISOString(),
        content: entry.contentMarkdown
      }
    ]
  };
}

export function contentSidebarEntryToPage(
  entry: ContentSidebarEntry,
  scope: ContentScope
): ContentPage {
  const updatedByLabel = entry.updatedByDisplayName?.trim() ?? `User ${entry.updatedBy}`;

  return {
    id: String(entry.id),
    slug: entry.slug,
    title: entry.title,
    icon: '📝',
    parentId: entry.parentId === null ? null : String(entry.parentId),
    description: 'Open this page to load the latest content.',
    updatedLabel: new Date(entry.updatedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    }),
    contributorCount: 1,
    tags: [scope === ContentScope.PROJECT ? 'Project' : 'Organization'],
    searchText: entry.title,
    updatedByLabel,
    updatedByPhotoUrl: entry.updatedByPhotoUrl,
    cover: buildCover(scope),
    versions: [
      {
        id: `${entry.id}-summary`,
        label: 'Current',
        createdAt: new Date(entry.updatedAt).toLocaleString(),
        author: updatedByLabel,
        summary: 'Open page to load content',
        isCurrent: true,
        content: ''
      }
    ]
  };
}

export function contentEntriesToPages(entries: ContentEntry[], scope: ContentScope): ContentPage[] {
  return entries.map((entry) => contentEntryToPage(entry, scope));
}

export function contentSidebarEntriesToPages(
  entries: ContentSidebarEntry[],
  scope: ContentScope
): ContentPage[] {
  return entries.map((entry) => contentSidebarEntryToPage(entry, scope));
}

export function contentEntriesToOrganizationPages(entries: ContentEntry[]): ContentPage[] {
  return contentEntriesToPages(entries, ContentScope.ORGANIZATION);
}

export function contentEntriesToProjectPages(entries: ContentEntry[]): ContentPage[] {
  return contentEntriesToPages(entries, ContentScope.PROJECT);
}

export function contentSidebarEntriesToOrganizationPages(
  entries: ContentSidebarEntry[]
): ContentPage[] {
  return contentSidebarEntriesToPages(entries, ContentScope.ORGANIZATION);
}

export function contentSidebarEntriesToProjectPages(entries: ContentSidebarEntry[]): ContentPage[] {
  return contentSidebarEntriesToPages(entries, ContentScope.PROJECT);
}

export function mergeSelectedContentEntryIntoPages(
  pages: ContentPage[],
  entry: ContentEntry,
  scope: ContentScope
): ContentPage[] {
  const selectedPage = contentEntryToPage(entry, scope);
  const selectedIndex = pages.findIndex((page) => page.slug === selectedPage.slug);

  if (selectedIndex === -1) {
    return [...pages, selectedPage];
  }

  return pages.map((page, index) => (index === selectedIndex ? selectedPage : page));
}

export function buildOrganizationContentPages(
  entries: ContentSidebarEntry[],
  selectedEntry?: ContentEntry
): ContentPage[] {
  const pages = contentSidebarEntriesToOrganizationPages(entries);
  return selectedEntry
    ? mergeSelectedContentEntryIntoPages(pages, selectedEntry, ContentScope.ORGANIZATION)
    : pages;
}

export function buildProjectContentPages(
  entries: ContentSidebarEntry[],
  selectedEntry?: ContentEntry
): ContentPage[] {
  const pages = contentSidebarEntriesToProjectPages(entries);
  return selectedEntry
    ? mergeSelectedContentEntryIntoPages(pages, selectedEntry, ContentScope.PROJECT)
    : pages;
}

function headingNode(title: string): ContentDocNode {
  return {
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text: title }] satisfies ContentTextNode[]
  };
}

export function buildContentMarkdown(title: string, body: ContentDocNode): string {
  const normalizedBody = getContentDocument(body);
  const bodyContent = normalizedBody.content ?? [];

  return serializeContentDocToMarkdown({
    type: 'doc',
    content: [headingNode(title), ...bodyContent]
  });
}

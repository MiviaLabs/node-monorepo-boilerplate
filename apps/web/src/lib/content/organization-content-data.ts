import type {
  ContentPage,
  ContentSearchResult,
  ContentVersion
} from '~/components/content/content-types';

import { getContentDocumentText } from '~/lib/projects/project-content-markdown';

function createVersion(
  pageId: string,
  author: string,
  summary: string,
  content: string,
  isCurrent = false
): ContentVersion {
  return {
    id: `${pageId}-${isCurrent ? 'current' : 'initial'}`,
    label: isCurrent ? 'v2' : 'v1',
    createdAt: isCurrent ? 'Today, 10:12' : 'Mar 18, 16:40',
    author,
    summary,
    isCurrent,
    content
  };
}

function getCurrentVersion(page: ContentPage): ContentVersion {
  return page.versions.find((version) => version.isCurrent) ?? page.versions[0]!;
}

function getExcerpt(searchText: string, query: string): string {
  const normalizedText = searchText.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return searchText.slice(0, 120).trim();
  }

  const start = Math.max(0, matchIndex - 36);
  const end = Math.min(searchText.length, matchIndex + normalizedQuery.length + 72);
  return searchText.slice(start, end).trim();
}

export function getOrganizationContentPages(workspaceName = 'Workspace'): ContentPage[] {
  const helloVersions = [
    createVersion(
      'hello',
      'System',
      'Created the first organization content page.',
      `# Hello

Welcome to ${workspaceName}. This is the organization-level content space.

Use it for shared notes, onboarding docs, working agreements, and anything that should exist above a single project.`,
      false
    ),
    createVersion(
      'hello',
      'System',
      'Refined the starter page copy.',
      `# Hello

Welcome to ${workspaceName}. This is the shared content space for the whole organization.

Start here with onboarding notes, operating principles, team references, and pages that should not live inside one project.`,
      true
    )
  ];
  const currentVersion = getCurrentVersion({
    id: 'hello',
    slug: 'hello',
    title: 'Hello',
    icon: '📝',
    parentId: null,
    description: 'Starter page for organization-wide content.',
    updatedLabel: 'Updated today',
    contributorCount: 1,
    tags: ['Organization'],
    searchText: '',
    updatedByLabel: 'System',
    updatedByPhotoUrl: null,
    cover: {
      accentClassName: 'from-slate-500/15 via-slate-500/5 to-transparent',
      eyebrow: 'Organization content',
      gradientClassName: 'from-slate-500/12 via-transparent to-transparent'
    },
    versions: helloVersions
  });

  return [
    {
      id: 'hello',
      slug: 'hello',
      title: 'Hello',
      icon: '📝',
      parentId: null,
      description: 'Starter page for organization-wide content.',
      updatedLabel: 'Updated today',
      contributorCount: 1,
      tags: ['Organization'],
      searchText: getContentDocumentText(currentVersion.content),
      updatedByLabel: 'System',
      updatedByPhotoUrl: null,
      cover: {
        accentClassName: 'from-slate-500/15 via-slate-500/5 to-transparent',
        eyebrow: 'Organization content',
        gradientClassName: 'from-slate-500/12 via-transparent to-transparent'
      },
      versions: helloVersions
    }
  ];
}

export function getOrganizationContentPageBySlug(
  pages: ContentPage[],
  slug: string
): ContentPage | undefined {
  return pages.find((page) => page.slug === slug);
}

export function searchOrganizationContentPages(
  pages: ContentPage[],
  query: string
): ContentSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return pages
    .filter((page) => page.searchText.toLowerCase().includes(normalizedQuery))
    .map((page) => {
      const currentVersion = getCurrentVersion(page);

      return {
        id: page.id,
        slug: page.slug,
        title: page.title,
        icon: page.icon,
        excerpt: getExcerpt(page.searchText, normalizedQuery),
        matchedVersionId: currentVersion.id
      };
    });
}

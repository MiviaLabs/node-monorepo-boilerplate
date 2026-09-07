import { getContentDocumentText } from './project-content-markdown';

import type {
  ContentDocument,
  ContentDocNode,
  ContentPage,
  ContentSearchResult,
  ContentTextNode,
  ContentVersion
} from '~/components/content/content-types';
import type { Project, ProjectMember } from '~/types/project.types';

function text(
  value: string,
  marks?: Array<{ type: string; attrs?: Record<string, string | number | boolean> }>
): ContentTextNode {
  return { text: value, type: 'text', ...(marks ? { marks } : {}) };
}

function paragraph(...content: ContentTextNode[]): ContentDocNode {
  return { type: 'paragraph', content };
}

function heading(level: 1 | 2 | 3, ...content: ContentTextNode[]): ContentDocNode {
  return { type: 'heading', attrs: { level }, content };
}

function bulletList(items: string[]): ContentDocNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(text(item))]
    }))
  };
}

function orderedList(items: string[]): ContentDocNode {
  return {
    type: 'orderedList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(text(item))]
    }))
  };
}

function taskList(items: Array<{ checked: boolean; label: string }>): ContentDocNode {
  return {
    type: 'taskList',
    content: items.map((item) => ({
      type: 'taskItem',
      attrs: { checked: item.checked },
      content: [paragraph(text(item.label))]
    }))
  };
}

function blockquote(...content: ContentDocNode[]): ContentDocNode {
  return { type: 'blockquote', content };
}

function doc(...content: ContentDocNode[]): ContentDocNode {
  return { type: 'doc', content };
}

function getSeed(projectId: string): number {
  const numericId = Number.parseInt(projectId, 10);
  return Number.isFinite(numericId) && numericId > 0 ? numericId : Math.max(projectId.length, 1);
}

function getMemberName(members: ProjectMember[], index: number, fallback: string): string {
  const member = members[index % Math.max(members.length, 1)];
  const trimmedName = member?.displayName?.trim();

  if (trimmedName && trimmedName.length > 0) {
    return trimmedName;
  }

  if (member?.userId) {
    return `User ${member.userId}`;
  }

  return fallback;
}

function getMemberPhotoUrl(members: ProjectMember[], index: number): string | null {
  const member = members[index % Math.max(members.length, 1)];
  return member?.photoUrl ?? null;
}

function createVersion(
  pageId: string,
  versionSuffix: string,
  versionIndex: number,
  author: string,
  summary: string,
  content: ContentDocument,
  isCurrent = false
): ContentVersion {
  return {
    id: `${pageId}-${versionSuffix}`,
    label: `v${versionIndex}`,
    createdAt:
      versionIndex === 3
        ? 'Today, 09:24'
        : versionIndex === 2
          ? 'Yesterday, 18:10'
          : 'Mar 16, 14:32',
    author,
    summary,
    isCurrent,
    content
  };
}

function getRequiredVersion(versions: ContentVersion[], pageId: string): ContentVersion {
  const currentVersion = versions.find((version) => version.isCurrent);

  if (currentVersion) {
    return currentVersion;
  }

  const firstVersion = versions[0];

  if (firstVersion) {
    return firstVersion;
  }

  throw new Error(`Content page ${pageId} is missing versions.`);
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

export function getProjectContentPages(project: Project, members: ProjectMember[]): ContentPage[] {
  const seed = getSeed(project.id);
  const lead = getMemberName(members, 0, project.name);
  const designer = getMemberName(members, 1, project.name);
  const operator = getMemberName(members, 2, project.name);

  const overviewVersions = [
    createVersion(
      'overview',
      'v1',
      1,
      lead,
      'Started the workspace brief and project framing.',
      doc(
        heading(1, text(`${project.name} workspace brief`)),
        paragraph(
          text(
            `${project.name} is moving from an empty project shell into a durable team workspace. This content becomes the source of truth for decisions, rollout notes, operational context, and recurring answers.`
          )
        ),
        heading(2, text('Current goals')),
        bulletList([
          'Give the team one place to understand scope, ownership, and next milestones.',
          'Keep implementation notes searchable before the real content backend exists.',
          'Prototype a writing environment that feels closer to Notion than a static CMS.'
        ]),
        heading(2, text('Success signal')),
        paragraph(
          text(
            'People should be able to open this page, understand the current state in under a minute, and jump directly into the page that answers their question.'
          )
        )
      )
    ),
    createVersion(
      'overview',
      'v2',
      2,
      designer,
      'Added design intent and page hierarchy.',
      doc(
        heading(1, text(`${project.name} workspace brief`)),
        paragraph(
          text(
            `${project.name} needs a workspace that feels operational on day one, even while still running entirely on mocks. The content should reward scanning, quick search, and structured writing.`
          )
        ),
        heading(2, text('Page hierarchy')),
        orderedList([
          'Workspace brief for shared context and ownership.',
          'Decision log for durable product and architecture calls.',
          'Launch runbook for operational rollout steps.'
        ]),
        blockquote(
          paragraph(
            text(
              'The content should feel like a living team surface, not a read-only deck pasted into a page.'
            )
          )
        ),
        heading(2, text('Why this matters')),
        paragraph(
          text(
            'The current shell already exposes issues and integrations. The content is the piece that turns those modules into a coherent workspace.'
          )
        )
      )
    ),
    createVersion(
      'overview',
      'v3',
      3,
      lead,
      'Refined into the current draft.',
      `# ${project.name} workspace brief

${project.name} is the **working memory** for the team. This mock content is intentionally rich enough to validate page hierarchy, block editing, search, and version browsing before a backend exists.

## What this prototype must prove

- [x] Nested content pages feel natural inside the project shell.
- [x] Search works across titles and body content, not only nav labels.
- [ ] Version history makes draft evolution legible before persistence is real.

## Working agreements

- Primary editor owner: ${lead}.
- Content review partner: ${designer}.
- Launch and support readiness owner: ${operator}.

\`\`\`markdown
mock-backend-status: draft
seed: ${seed}
project-id: ${project.id}
workspace: content
\`\`\``,
      true
    )
  ];

  const decisionsVersions = [
    createVersion(
      'decisions',
      'v1',
      1,
      designer,
      'Captured the initial architecture notes.',
      doc(
        heading(1, text(`${project.name} decision log`)),
        paragraph(
          text('Record decisions here when the tradeoff matters beyond the current sprint.')
        ),
        heading(2, text('Decision 001')),
        paragraph(
          text(
            'Adopt a block-based editor prototype with Tiptap instead of shipping another static card page.'
          )
        ),
        bulletList([
          'Closer to the intended long-term authoring model.',
          'Lets search and version history operate on realistic content.',
          'Makes mock workflows feel materially closer to production.'
        ])
      )
    ),
    createVersion(
      'decisions',
      'v2',
      2,
      lead,
      'Added rationale and constraints.',
      doc(
        heading(1, text(`${project.name} decision log`)),
        paragraph(
          text(
            'This page preserves the high-signal decisions that explain why the project workspace looks and behaves the way it does.'
          )
        ),
        heading(2, text('Decision 001')),
        paragraph(
          text('Use a routed content page tree rather than a single long document.'),
          text(' This keeps the shell compatible with direct links and page-level history.', [
            { type: 'italic' }
          ])
        ),
        heading(2, text('Decision 002')),
        paragraph(
          text('Keep mock data deterministic per project so screenshots and tests remain stable.')
        ),
        blockquote(
          paragraph(
            text(
              'The mock should be realistic enough to stress the interaction model, not just the visual design.'
            )
          )
        )
      ),
      true
    )
  ];

  const runbookVersions = [
    createVersion(
      'runbook',
      'v1',
      1,
      operator,
      'Outlined launch sequence.',
      doc(
        heading(1, text(`${project.name} launch runbook`)),
        paragraph(
          text(
            'Use this page for operational sequencing, release coordination, and post-launch checks.'
          )
        ),
        heading(2, text('Pre-launch checklist')),
        taskList([
          { checked: true, label: 'Freeze copy for initial workspace pages.' },
          { checked: false, label: 'Verify content search results with realistic seeded content.' },
          { checked: false, label: 'Confirm version snapshots render correctly on mobile.' }
        ])
      )
    ),
    createVersion(
      'runbook',
      'v2',
      2,
      operator,
      'Expanded support notes and handoff copy.',
      doc(
        heading(1, text(`${project.name} launch runbook`)),
        paragraph(
          text(
            'This page captures the operator view: rollout steps, fallback actions, and the minimum comms needed to keep the launch calm.'
          )
        ),
        heading(2, text('Launch sequence')),
        orderedList([
          'Publish the workspace brief and decision log.',
          'Validate page search and linked navigation.',
          'Walk the version history with reviewers before sharing broadly.'
        ]),
        heading(2, text('Support note')),
        paragraph(
          text(
            'If the latest draft is noisy, reviewers should open the previous version instead of blocking the whole workspace.'
          )
        )
      ),
      true
    )
  ];

  const pages: ContentPage[] = [
    {
      id: 'overview',
      slug: 'workspace-brief',
      title: `${project.name} workspace brief`,
      icon: '◌',
      parentId: null,
      description: '',
      updatedLabel: 'Updated 18m ago',
      contributorCount: Math.max(2, members.length),
      tags: ['Overview', 'Scope'],
      updatedByLabel: getMemberName(members, 0, 'Workspace lead'),
      updatedByPhotoUrl: getMemberPhotoUrl(members, 0),
      cover: {
        accentClassName: 'bg-sky-500/15 text-sky-700 ring-sky-500/25 dark:text-sky-300',
        eyebrow: 'Workspace brief',
        gradientClassName:
          'from-sky-500/20 via-cyan-500/10 to-transparent dark:from-sky-500/25 dark:via-cyan-500/15'
      },
      versions: overviewVersions,
      searchText: getContentDocumentText(getRequiredVersion(overviewVersions, 'overview').content)
    },
    {
      id: 'decisions',
      slug: 'decision-log',
      title: `${project.name} decision log`,
      icon: '◇',
      parentId: null,
      description: 'Durable rationale for product, workspace, and implementation tradeoffs.',
      updatedLabel: 'Updated yesterday',
      contributorCount: Math.max(2, members.length - 1 || 2),
      tags: ['Architecture', 'Product'],
      updatedByLabel: getMemberName(members, 1, 'Decision owner'),
      updatedByPhotoUrl: getMemberPhotoUrl(members, 1),
      cover: {
        accentClassName: 'bg-violet-500/15 text-violet-700 ring-violet-500/25 dark:text-violet-300',
        eyebrow: 'Decision history',
        gradientClassName:
          'from-violet-500/20 via-fuchsia-500/10 to-transparent dark:from-violet-500/25 dark:via-fuchsia-500/15'
      },
      versions: decisionsVersions,
      searchText: getContentDocumentText(getRequiredVersion(decisionsVersions, 'decisions').content)
    },
    {
      id: 'runbook',
      slug: 'launch-runbook',
      title: `${project.name} launch runbook`,
      icon: '△',
      parentId: null,
      description: 'Operational launch sequencing, fallback notes, and reviewer handoff.',
      updatedLabel: 'Updated 3h ago',
      contributorCount: Math.max(1, members.length - 1),
      tags: ['Ops', 'Launch'],
      updatedByLabel: getMemberName(members, 2, 'Operator'),
      updatedByPhotoUrl: getMemberPhotoUrl(members, 2),
      cover: {
        accentClassName: 'bg-amber-500/15 text-amber-700 ring-amber-500/25 dark:text-amber-300',
        eyebrow: 'Operational playbook',
        gradientClassName:
          'from-amber-500/20 via-orange-500/10 to-transparent dark:from-amber-500/25 dark:via-orange-500/15'
      },
      versions: runbookVersions,
      searchText: getContentDocumentText(getRequiredVersion(runbookVersions, 'runbook').content)
    }
  ];

  return pages.map((page) => {
    const latestVersion = getRequiredVersion(page.versions, page.id);
    return {
      ...page,
      searchText: `${page.title} ${page.description} ${page.tags.join(' ')} ${getContentDocumentText(latestVersion.content)}`
    };
  });
}

export function getProjectContentPageBySlug(
  pages: ContentPage[],
  slug: string | undefined
): ContentPage | null {
  if (!slug) {
    return pages[0] ?? null;
  }

  return pages.find((page) => page.slug === slug) ?? null;
}

export function searchProjectContentPages(
  pages: ContentPage[],
  query: string | undefined
): ContentSearchResult[] {
  const normalizedQuery = query?.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return pages
    .filter((page) => page.searchText.toLowerCase().includes(normalizedQuery))
    .map((page) => {
      const fallbackVersion = getRequiredVersion(page.versions, page.id);
      const matchedVersion = page.versions.find((version) =>
        getContentDocumentText(version.content).toLowerCase().includes(normalizedQuery)
      );

      return {
        id: page.id,
        slug: page.slug,
        title: page.title,
        icon: page.icon,
        excerpt: getExcerpt(page.searchText, normalizedQuery),
        matchedVersionId: matchedVersion?.id ?? fallbackVersion.id
      };
    });
}

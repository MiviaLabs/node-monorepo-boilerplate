'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useMemo } from 'react';

import type { ContentPage } from '~/components/content/content-types';
import type { ContentComment } from '~/types/content.types';
import type { Project } from '~/types/project.types';

import { ContentComments } from '~/components/content/content-comments';
import { ContentWorkspace } from '~/components/content/content-workspace';
import { contentApi } from '~/lib/api/content-api';
import { getContentAncestorPath } from '~/lib/content/content-tree';

interface ProjectContentPageContentProps {
  canEdit: boolean;
  canDelete: boolean;
  initialComments?: ContentComment[];
  pages: ContentPage[];
  project: Project;
  selectedPageSlug?: string;
}

export function ProjectContentPageContent({
  canEdit,
  canDelete,
  initialComments = [],
  pages,
  project,
  selectedPageSlug
}: ProjectContentPageContentProps) {
  const router = useRouter();
  const breadcrumbs = useMemo(() => {
    const path = getContentAncestorPath(pages, selectedPageSlug);
    const contentHrefPrefix = `/projects/${project.id}/content`;

    return path.map((page, index) => ({
      label: page.title.trim() || 'Untitled',
      href: index === path.length - 1 ? undefined : `${contentHrefPrefix}/${page.slug}`
    }));
  }, [pages, project.id, selectedPageSlug]);
  const selectedPage = useMemo(
    () => pages.find((page) => page.slug === selectedPageSlug) ?? pages[0] ?? null,
    [pages, selectedPageSlug]
  );
  const parentSlug =
    selectedPage && selectedPage.parentId !== null
      ? pages.find((page) => page.id === selectedPage.parentId)?.slug
      : undefined;
  const deleteFallbackHref = parentSlug
    ? `/projects/${project.id}/content/${parentSlug}`
    : `/projects/${project.id}/content`;
  const selectedPageId =
    selectedPage !== null && Number.isFinite(Number(selectedPage.id))
      ? Number(selectedPage.id)
      : null;

  return (
    <div className="space-y-5">
      <ContentWorkspace
        breadcrumbs={breadcrumbs}
        pages={pages}
        selectedPageSlug={selectedPageSlug}
        canEdit={canEdit}
        canDelete={canDelete}
        emptyStateDescription={`Create the first page for ${project.name} from the sidebar.`}
        onSave={async (
          { baseRevision, pageId, currentSlug, title, contentMarkdown, slug },
          options
        ) => {
          const updated = await contentApi.updateContentEntry(
            Number(pageId),
            {
              baseRevision,
              title,
              contentMarkdown,
              slug
            },
            undefined,
            options
          );
          startTransition(() => {
            if (updated.slug !== currentSlug) {
              router.replace(`/projects/${project.id}/content/${updated.slug}`);
            }
          });
          return { revision: updated.revision ?? baseRevision, slug: updated.slug };
        }}
        onDelete={async (page) => {
          await contentApi.deleteContentEntry(Number(page.id));
          startTransition(() => {
            router.replace(deleteFallbackHref);
            router.refresh();
          });
        }}
      />

      <div className="mx-auto max-w-[900px]">
        <ContentComments
          canCreateComment={canEdit}
          contentEntryId={selectedPageId}
          initialComments={initialComments}
        />
      </div>
    </div>
  );
}

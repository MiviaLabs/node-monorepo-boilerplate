import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readAppShellClientSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'app-shell-client.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('dashboard app shell content create flow architecture', () => {
  it('creates draft pages and routes to the created slug', async () => {
    const source = await readAppShellClientSource();

    expect(source).toContain('const createContentEntry = async (parentId?: number) => {');
    expect(source).toContain('const created = await contentApi.createDraftContentEntry({');
    expect(source).toContain("title: 'Untitled'");
    expect(source).toContain("contentMarkdown: '# Untitled'");
    expect(source).toContain('...(parentId !== undefined ? { parentId } : {})');
    expect(source).toContain('router.push(`${contentHrefPrefix}/${created.slug}`);');
  });

  it('keeps content sidebar scope tied to the active route instead of persisted project context', async () => {
    const source = await readAppShellClientSource();

    expect(source).toContain(
      'const effectiveContentProjectId = resolveEffectiveContentProjectId({'
    );
    expect(source).toContain('routeProjectId: routeScopedProjectId,');
    expect(source).toContain('const contentHrefPrefix =');
    expect(source).toContain('effectiveContentProjectId !== null');
    expect(source).toContain('`/projects/${effectiveContentProjectId}/content`');
    expect(source).toContain("'/content'");
    expect(source).toContain('? { projectId: scopedProjectId, scope: ContentScope.PROJECT }');
    expect(source).toContain(': { scope: ContentScope.ORGANIZATION }');
    expect(source).not.toContain('return routeProjectId ?? persistedProjectId ?? null;');
  });

  it('maps org routes with project analogues into project routes during context selection', async () => {
    const source = await readAppShellClientSource();

    expect(source).toContain(
      'function mapProjectContextSelectionHref(pathname: string, nextProjectId: string): string | null'
    );
    expect(source).toContain('return `/projects/${nextProjectId}/content`;');
    expect(source).toContain('return `/projects/${nextProjectId}/members`;');
    expect(source).toContain('return `/projects/${nextProjectId}/settings`;');
    expect(source).toContain('return `/projects/${nextProjectId}`;');
    expect(source).toContain(
      'const nextHref = mapProjectContextSelectionHref(pathname, projectId);'
    );
    expect(source).toContain('if (nextHref) {');
    expect(source).toContain('navigateTo(nextHref);');
  });

  it('comments out the project section and exposes issues through the general section for now', async () => {
    const source = await readAppShellClientSource();

    expect(source).toContain(
      '// Project sidebar section is intentionally disabled during the issues/navigation restructure.'
    );
    expect(source).toContain('project: [],');
    expect(source).toContain('yourWork: getMainSidebarItems(),');
  });

  it('keeps section ordering on dedicated drag handles instead of the full section container', async () => {
    const source = await readAppShellClientSource();

    expect(source).not.toContain('draggable={!isSidebarCollapsed && !isSavingSectionOrder}');
    expect(source).toContain('data-sidebar-section-drag-handle={sectionDragHandle.sectionKey}');
    expect(source).toContain('sectionDragHandle.onStartSectionDrag(sectionDragHandle.sectionKey);');
    expect(source).toContain('sectionDragHandle.onDropSection(sectionDragHandle.sectionKey);');
  });

  it('gives top-level issues routes the same fixed workspace shell treatment as my work', async () => {
    const source = await readAppShellClientSource();

    expect(source).toContain('pathname === DashboardRoute.Issues');
    expect(source).toContain('pathname.startsWith(`${DashboardRoute.Issues}/`)');
    expect(source).toContain("'h-svh overflow-hidden'");
    expect(source).toContain("'flex min-h-0 min-w-0 flex-1 overflow-hidden'");
  });
});

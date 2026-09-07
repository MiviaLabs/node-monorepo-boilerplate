import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readContentWorkspaceSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'content-workspace.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('content workspace autosave architecture', () => {
  it('keeps saving inside the shared workspace with a debounced autosave effect', async () => {
    const source = await readContentWorkspaceSource();

    expect(source).toContain('const CONTENT_AUTOSAVE_DELAY_MS = 900;');
    expect(source).toContain('const [saveState, setSaveState] = useState<');
    expect(source).toContain("editor.on('update', handleUpdate);");
    expect(source).toContain('const performSave = async (');
    expect(source).toContain('queuedSaveRef.current = { payload, snapshot, options };');
    expect(source).toContain('window.setTimeout(() => {');
    expect(source).toContain('void performSave(payload, snapshot);');
    expect(source).toContain("window.addEventListener('beforeunload', handleBeforeUnload);");
    expect(source).toContain("window.addEventListener('pagehide', handlePageHide);");
    expect(source).toContain(
      "document.addEventListener('visibilitychange', handleVisibilityChange);"
    );
    expect(source).toContain('isContentConflictError(error)');
    expect(source).toContain("'Conflict detected'");
    expect(source).toContain("'Saving...'");
    expect(source).toContain("'Saved'");
  });

  it('keeps destructive delete actions in the shared page action menu', async () => {
    const source = await readContentWorkspaceSource();

    expect(source).toContain('canDelete = false');
    expect(source).toContain('onDelete?: (page: ContentPage) => Promise<void>;');
    expect(source).toContain(
      "'Delete this page and all child pages? This action cannot be undone.'"
    );
    expect(source).toContain("'Delete page'");
  });

  it('autosizes the page title textarea so wrapped titles remain fully visible', async () => {
    const source = await readContentWorkspaceSource();

    expect(source).toContain('const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);');
    expect(source).toContain("textarea.style.height = '0px';");
    expect(source).toContain('textarea.style.height = `${textarea.scrollHeight}px`;');
    expect(source).toContain('ref={titleTextareaRef}');
  });

  it('keeps the content page header spacing tight above the title and page actions', async () => {
    const source = await readContentWorkspaceSource();

    expect(source).toContain('max-w-[1180px] px-4 pb-16 pt-4');
    expect(source).toContain('px-6 pb-10 pt-4 sm:px-12');
    expect(source).toContain('<div className="mt-1">');
    expect(source).toContain(
      "import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';"
    );
    expect(source).toContain('function getAvatarInitials(value: string): string {');
    expect(source).toContain('src={page.updatedByPhotoUrl ?? undefined}');
    expect(source).toContain('{page.updatedByLabel}');
    expect(source).toContain('Updated {currentVersion.createdAt}');
  });

  it('keeps slug changes explicit through a dedicated dialog', async () => {
    const source = await readContentWorkspaceSource();

    expect(source).toContain("const [slugValue, setSlugValue] = useState(page?.slug ?? '');");
    expect(source).toContain(
      'const [hasExplicitSlugOverride, setHasExplicitSlugOverride] = useState(false);'
    );
    expect(source).toContain('slugValue: hasExplicitSlugOverride ? slugValue : undefined,');
    expect(source).toContain('<DialogTitle>Edit page slug</DialogTitle>');
    expect(source).toContain('setHasExplicitSlugOverride(true);');
  });

  it('offers restoring a locally persisted draft when it differs from the server copy', async () => {
    const source = await readContentWorkspaceSource();

    expect(source).toContain('readStoredContentDraft(page.id)');
    expect(source).toContain('shouldRestoreStoredContentDraft({');
    expect(source).toContain('<DialogTitle>Restore local draft?</DialogTitle>');
    expect(source).toContain('handleRestoreStoredDraft');
    expect(source).toContain('clearStoredContentDraft(page.id);');
  });

  it('keeps conflict resolution inside a compare dialog with explicit winner selection', async () => {
    const source = await readContentWorkspaceSource();

    expect(source).toContain('contentApi.getContentEntry(Number(payload.pageId))');
    expect(source).toContain('<DialogTitle>Resolve content conflict</DialogTitle>');
    expect(source).toContain('<TabsTrigger value="overview">Overview</TabsTrigger>');
    expect(source).toContain('<TabsTrigger value="changes">Changes</TabsTrigger>');
    expect(source).toContain('<TabsTrigger value="local">Local draft</TabsTrigger>');
    expect(source).toContain('<TabsTrigger value="server">Latest server</TabsTrigger>');
    expect(source).toContain('buildStructuredContentConflictDiff(');
    expect(source).toContain('summarizeStructuredContentConflictDiff(conflictDiffSegments)');
    expect(source).toContain('Structured changes will appear once both versions are loaded.');
    expect(source).toContain('handleUseServerVersion');
    expect(source).toContain('handleRestoreConflictLocalDraft');
    expect(source).toContain('Review conflict');
  });

  it('keeps a slash-command block menu inside the shared editor surface', async () => {
    const source = await readContentWorkspaceSource();

    expect(source).toContain("import type { SlashCommandId } from './content-slash-menu';");
    expect(source).toContain(
      "import { ContentCodeBlockExtension } from './content-code-block-node';"
    );
    expect(source).toContain(
      "import { ContentHeadingExtension } from './content-heading-extension';"
    );
    expect(source).toContain(
      "import { ContentTableOfContentsExtension } from './content-table-of-contents-node';"
    );
    expect(source).toContain("filterSlashCommandItems(slashMenu?.query ?? '')");
    expect(source).toContain('const SLASH_MENU_WIDTH_PX = 380;');
    expect(source).toContain('function getSlashMenuPlacement(');
    expect(source).toContain('const SLASH_COMMAND_ICONS: Record<');
    expect(source).toContain('function executeSlashCommand(');
    expect(source).toContain("case 'table-of-contents':");
    expect(source).toContain("chain.insertContent({ type: 'tableOfContents' }).run();");
    expect(source).toContain("case 'mermaid':");
    expect(source).toContain("attrs: { language: 'mermaid' },");
    expect(source).toContain('codeBlock: false,');
    expect(source).toContain('heading: false');
    expect(source).toContain('ContentCodeBlockExtension,');
    expect(source).toContain('ContentHeadingExtension,');
    expect(source).toContain('ContentTableOfContentsExtension,');
    expect(source).toContain("window.addEventListener('scroll', updateSlashMenuPlacement, true);");
    expect(source).toContain("window.addEventListener('resize', updateSlashMenuPlacement);");
    expect(source).toContain('data-content-slash-menu="true"');
    expect(source).toContain('Type / for blocks');
    expect(source).toContain('executeSlashCommand(editor, selected.id, menu.range);');
  });

  it('does not expose the unsupported small-text mode in the shared editor toolbar', async () => {
    const source = await readContentWorkspaceSource();

    expect(source).not.toContain("name: 'smallText'");
    expect(source).not.toContain('value="small-text"');
    expect(source).not.toContain("setMark('smallText')");
  });
});

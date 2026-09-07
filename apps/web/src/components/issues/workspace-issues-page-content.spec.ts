import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readSource() {
  const fs = await import('node:fs/promises');
  return fs.readFile(path.join(__dirname, 'workspace-issues-page-content.tsx'), 'utf-8');
}

describe('workspace issues page layout', () => {
  it('keeps the original split issues workspace design instead of the simplified card list', async () => {
    const source = await readSource();

    expect(source).toContain('placeholder="Search issues, labels, or IDs"');
    expect(source).toContain('xl:grid-cols-[minmax(0,1fr)_390px]');
    expect(source).toContain('flex h-full min-h-0 min-w-0 flex-1 overflow-hidden');
    expect(source).toContain('min-h-0 flex-1 overflow-y-auto');
    expect(source).toContain('hidden min-h-0 min-w-0 xl:flex xl:flex-col');
    expect(source).toContain('Issue details');
    expect(source).toContain('WorkspaceStat');
    expect(source).toContain('return next ? `/issues/${issueId}?${next}` : `/issues/${issueId}`;');
    expect(source).toContain('Saved views');
    expect(source).toContain('Save view');
    expect(source).toContain('Reset view');
    expect(source).not.toContain('min-h-[720px]');
    expect(source).not.toContain('xl:sticky xl:top-0');
    expect(source).not.toContain(
      'Review issues across the workspace or narrow the list to a single project.'
    );
  });

  it('uses an explicit create dialog instead of creating an untitled issue immediately', async () => {
    const source = await readSource();

    expect(source).toContain('IssueCreateDialog');
    expect(source).toContain('setIsCreateDialogOpen(true)');
    expect(source).toContain("toast.success('Issue created')");
    expect(source).not.toContain("title: 'Untitled issue'");
  });

  it('wires assignee edits through the shared inline editor in both list and details surfaces', async () => {
    const source = await readSource();

    expect(source).toContain('InlineAssigneeEditor');
    expect(source).toContain('buildIssueAssigneeOptions(');
    expect(source).toContain('canManageAssignees={canUpdateIssues}');
    expect(source).toContain('currentUserId={currentUserId}');
    expect(source).toContain('canApplyInlineIssueUpdate');
  });

  it('renders a condensed editable details panel with inline title, markdown description, and color-aware labels', async () => {
    const source = await readSource();

    expect(source).toContain('function WorkspaceIssueDescriptionEditor(');
    expect(source).toContain('ContentCodeBlockExtension');
    expect(source).toContain('ContentHeadingExtension');
    expect(source).toContain('LinkExtension.configure({');
    expect(source).toContain('TaskList');
    expect(source).toContain('TaskItem.configure({');
    expect(source).toContain('Underline');
    expect(source).toContain('TextAlign.configure({');
    expect(source).toContain('parseMarkdownToContentDoc(');
    expect(source).toContain('serializeContentDocToMarkdown(');
    expect(source).toContain("'data-issue-description-editor': 'true'");
    expect(source).toContain("[&_.ProseMirror_ul[data-type='taskList']]:list-none");
    expect(source).toContain("[&_.ProseMirror_ul[data-type='taskList']_li>label>input]:m-0");
    expect(source).toContain('aria-label="Issue title"');
    expect(source).toContain('placeholder="Untitled issue"');
    expect(source).toContain('catch {\n      setTitleValue(sourceIssue.title);');
    expect(source).toContain("placeholder: 'Type / for blocks, or start writing issue context.'");
    expect(source).toContain('function WorkspaceIssueLabelBadge(');
    expect(source).toContain('borderColor: label.color');
    expect(source).toContain('Add label');
    expect(source).toContain('placeholder="Search or create a label"');
    expect(source).toContain('Create "{labelQuery.trim()}"');
    expect(source).toContain('type="color"');
    expect(source).toContain('onPersistIssue(');
    expect(source).toContain('onCreateLabel(');
    expect(source).toContain('onRemoveLabel(');
    expect(source).toContain('InlineIssueDeliveryEditor');
    expect(source).toContain('WorkspaceIssueConversationTabs');
    expect(source).toContain('CompactIssueConversationTabs');
    expect(source).toContain('WorkspaceIssueSubtasksSection');
    expect(source).toContain("const [subtaskDraft, setSubtaskDraft] = useState('')");
    expect(source).toContain('const handleSubtaskUpdate = (');
    expect(source).toContain('const handleCreateSubtask = async (parentIssueId: string) => {');
    expect(source).toContain('applyPreviewToWorkspaceSubtask(previousSubtask, nextPreview)');
    expect(source).toContain('issueSubtasks={selectedIssueSubtasks}');
    expect(source).toContain('onCreateSubtask={handleCreateSubtask}');
    expect(source).toContain('onUpdateSubtask={handleSubtaskUpdate}');
    expect(source).toContain('issuesApi.createIssueComment');
    expect(source).toContain('const ensureIssueDetail = useCallback(');
    expect(source).toContain('(issueId: string) => {');
    expect(source).toContain('.getIssue(Number(issueId))');
    expect(source).toContain('Loading comments and activity...');
    expect(source).toContain('function getProjectBadgeLabel(project: Project): string');
    expect(source).toContain('title={record.project.name}');
    expect(source).toContain('aria-label={getProjectBadgeAccessibleLabel(record.project)}');
    expect(source).toContain('href={onIssueHref(record.issue.id)}');
    expect(source).toContain('IssueActionsMenu');
    expect(source).toContain('canDeleteIssues = false');
    expect(source).toContain('openLabel="Open full page"');
    expect(source).toContain('triggerLabel="Open sidebar issue actions"');
    expect(source).toContain('triggerLabel="Open issue row actions"');
    expect(source).toContain('onDeleteIssue(record.issue.id)');
    expect(source).toContain('grid-cols-[110px_minmax(0,1.5fr)_140px_110px_110px_56px_44px]');
    expect(source).toContain(
      'const [deletingIssueId, setDeletingIssueId] = useState<string | null>(null)'
    );
    expect(source).toContain(
      'const [deletedIssueIds, setDeletedIssueIds] = useState<Record<string, true>>({})'
    );
    expect(source).toContain('.filter((record) => deletedIssueIds[record.issue.id] !== true)');
    expect(source).toContain('const handleDeleteIssue = async (issueId: string) => {');
    expect(source).toContain('await issuesApi.deleteIssue(Number(issueId));');
    expect(source).toContain('[issueId]: true');
    expect(source).toContain('delete next[issueId];');
    expect(source).toContain('if (queryState.issue === issueId) {');
    expect(source).toContain('handleDetailsClose();');
    expect(source).toContain('replaceQueryState({ issue: undefined });');
    expect(source).toContain("toast.success('Issue deleted'");
    expect(source).not.toContain('>Updated<');
  });

  it('keeps the details panel hooks unconditional when no issue is selected', async () => {
    const source = await readSource();

    expect(source).toContain(
      "const [titleValue, setTitleValue] = useState(record?.sourceIssue.title ?? '')"
    );
    expect(source).toContain('if (!record || !sourceIssue) {');
    expect(source).not.toContain(
      'if (!record) {\n    return (\n      <div className="flex h-full min-h-0 flex-1 items-center justify-center'
    );
  });

  it('removes deleted issues locally and closes the selected preview when delete succeeds', async () => {
    const source = await readSource();

    expect(source).toContain(
      'const [deletingIssueId, setDeletingIssueId] = useState<string | null>(null);'
    );
    expect(source).toContain(
      'const [deletedIssueIds, setDeletedIssueIds] = useState<Record<string, true>>({});'
    );
    expect(source).toContain('.filter((record) => deletedIssueIds[record.issue.id] !== true)');
    expect(source).toContain('const handleDeleteIssue = async (issueId: string) => {');
    expect(source).toContain('await issuesApi.deleteIssue(Number(issueId));');
    expect(source).toContain('setDeletedIssueIds((current) => ({');
    expect(source).toContain('delete next[issueId];');
    expect(source).toContain('if (queryState.issue === issueId) {');
    expect(source).toContain('handleDetailsClose();');
    expect(source).toContain('router.refresh();');
    expect(source).toContain("toast.success('Issue deleted'");
  });
});

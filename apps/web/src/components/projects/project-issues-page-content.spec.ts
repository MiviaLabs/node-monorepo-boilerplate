import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readProjectIssuesPageContentSource() {
  const fs = await import('node:fs/promises');
  const filePath = path.join(__dirname, 'project-issues-page-content.tsx');
  return fs.readFile(filePath, 'utf-8');
}

describe('project issues page layout', () => {
  it('renders the same compact stat rail pattern used by other list pages', async () => {
    const source = await readProjectIssuesPageContentSource();

    expect(source).toContain(
      "import { WorkspaceStat, WorkspaceStatSize } from '~/components/ui/workspace-stat';"
    );
    expect(source).toContain('label="Total"');
    expect(source).toContain('label="In Progress"');
    expect(source).toContain('label="Blocked"');
    expect(source).toContain('label="Done"');
    expect(source).toContain('size={WorkspaceStatSize.COMPACT}');
  });

  it('keeps the shown pill and search/filter controls below the stat rail', async () => {
    const source = await readProjectIssuesPageContentSource();

    expect(source).toContain('{filteredIssues.length} shown');
    expect(source).toContain('placeholder="Search issues, labels, or IDs"');
    expect(source).toContain(
      'className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"'
    );
  });

  it('wires assignee and watcher mutations through the real issues API', async () => {
    const source = await readProjectIssuesPageContentSource();

    expect(source).toContain('buildInlineIssueMutation');
    expect(source).toContain('canApplyInlineIssueUpdate');
    expect(source).toContain('InlineAssigneeEditor');
    expect(source).toContain('buildIssueAssigneeOptions');
    expect(source).toContain('canManageAssignees={canUpdateIssue}');
    expect(source).toContain('disabled={!canUpdateIssue}');
    expect(source).toContain('issuesApi.addIssueWatcher');
    expect(source).toContain('issuesApi.removeIssueWatcher');
    expect(source).toContain('initialWatchers');
    expect(source).toContain('currentUserId');
    expect(source).toContain('Watchers');
  });

  it('uses the shared delivery editor so due date and story points stay editable with the same SP wording', async () => {
    const source = await readProjectIssuesPageContentSource();

    expect(source).toContain('InlineIssueDeliveryEditor');
    expect(source).toContain('onPersistIssue');
    expect(source).toContain('issuesApi.updateIssue');
  });

  it('keeps the standalone issue detail page on the full-height internal-scroll layout and renders description with the markdown editor stack', async () => {
    const source = await readProjectIssuesPageContentSource();

    expect(source).toContain(
      'flex h-full min-h-0 min-w-0 flex-1 overflow-y-auto xl:overflow-hidden'
    );
    expect(source).toContain('xl:min-h-0 xl:flex-1 xl:overflow-y-auto');
    expect(source).toContain('xl:flex xl:min-h-0 xl:flex-col xl:border-t-0 xl:overflow-hidden');
    expect(source).toContain('parseMarkdownToContentDoc');
    expect(source).toContain('serializeContentDocToMarkdown');
    expect(source).toContain('data-project-issue-description-editor');
    expect(source).toContain('const [titleValue, setTitleValue] = useState(issue.title);');
    expect(source).toContain('const handleTitleBlur = async () => {');
    expect(source).toContain('await handlePersistIssue({ title: nextTitle });');
    expect(source).toContain('catch {\n      setTitleValue(currentIssue.title);');
    expect(source).toContain('placeholder="Untitled issue"');
    expect(source).toContain('aria-label="Issue title"');
    expect(source).toContain('function getProjectBadgeLabel(project: Project): string');
    expect(source).toContain('title={project.name}');
    expect(source).toContain('aria-label={getProjectBadgeAccessibleLabel(project)}');
    expect(source).toContain('IssueActionsMenu');
    expect(source).toContain('canDeleteIssue={canDeleteIssue}');
    expect(source).toContain('onDeleteIssue={handleDeleteIssue}');
    expect(source).toContain('showOpenIssue={false}');
    expect(source).toContain('triggerLabel="Open issue detail actions"');
    expect(source).toContain('router.replace(listHref);');
    expect(source).not.toContain('whitespace-pre-wrap text-sm leading-7 text-foreground/90');
  });

  it('uses the shared issue create dialog instead of a dead new issue button', async () => {
    const source = await readProjectIssuesPageContentSource();

    expect(source).toContain('IssueCreateDialog');
    expect(source).toContain('setIsCreateDialogOpen(true)');
    expect(source).toContain("toast.success('Issue created')");
  });

  it('keeps the standalone issue detail page free of placeholder description copy', async () => {
    const source = await readProjectIssuesPageContentSource();

    expect(source).toContain('function IssueDescriptionSection');
    expect(source).toContain('CompactIssueConversationTabs');
    expect(source).not.toContain('Description content stays in the main reading column');
    expect(source).not.toContain('This section can expand to support richer markdown content');
  });

  it('gates subtask creation on issue create permission instead of update permission', async () => {
    const source = await readProjectIssuesPageContentSource();

    expect(source).toContain('canCreateIssue = false');
    expect(source).toContain('canCreateSubtask={canCreateIssue}');
    expect(source).toContain(
      'if (!canCreateIssue || isCreatingSubtask || subtaskDraft.trim().length === 0)'
    );
    expect(source).toContain('const projectIdValue = Number(project.id);');
    expect(source).toContain(
      '...(Number.isFinite(projectIdValue) ? { projectId: projectIdValue } : {})'
    );
    expect(source).toContain(
      'disabled={!canCreateSubtask || subtaskDraft.trim().length === 0 || isCreatingSubtask}'
    );
  });

  it('uses shared inline issue editors and the shared mutation path for subtasks', async () => {
    const source = await readProjectIssuesPageContentSource();

    expect(source).toContain('function IssueSubtaskRow({');
    expect(source).toContain('<InlineStatusEditor');
    expect(source).toContain('<InlinePriorityEditor');
    expect(source).toContain('<InlineAssigneeEditor');
    expect(source).toContain('onUpdateSubtask={updateSubtask}');
    expect(source).toContain('const updateSubtask = (');
    expect(source).toContain(
      'buildInlineIssueMutation(Number(issueId), previousPreview, nextPreview)'
    );
    expect(source).toContain('applyPreviewToSubtask(subtask, nextPreview)');
    expect(source).toContain('canUpdateIssue={canUpdateIssue}');
  });
});

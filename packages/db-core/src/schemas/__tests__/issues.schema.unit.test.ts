import { describe, expect, it } from '@jest/globals';
import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  ISSUE_ACTIVITY_TYPE_ENUM,
  ISSUE_PRIORITY_ENUM,
  ISSUE_RELATION_TYPE_ENUM,
  ISSUE_STATUS_ENUM,
  issueActivity,
  issueAssignees,
  issueAttachments,
  issueComments,
  issueLabelAssignments,
  issueLabels,
  issueRelations,
  issues,
  issueWatchers,
  type Issue,
  type IssueActivity,
  type IssueAttachment,
  type IssueAssignee,
  type IssueComment,
  type IssueLabel,
  type IssueLabelAssignment,
  type IssueRelation,
  type IssueWatcher,
  type NewIssue
} from '../index';

describe('issues.schema', () => {
  it('should expose the full issues domain tables from the schema barrel', () => {
    expect(typeof issues).toBe('object');
    expect(typeof issueAssignees).toBe('object');
    expect(typeof issueWatchers).toBe('object');
    expect(typeof issueComments).toBe('object');
    expect(typeof issueLabels).toBe('object');
    expect(typeof issueLabelAssignments).toBe('object');
    expect(typeof issueRelations).toBe('object');
    expect(typeof issueActivity).toBe('object');
    expect(typeof issueAttachments).toBe('object');
  });

  it('should export the expected issue enums', () => {
    expect(ISSUE_STATUS_ENUM).toEqual(['backlog', 'in_progress', 'blocked', 'done']);
    expect(ISSUE_PRIORITY_ENUM).toEqual(['urgent', 'high', 'medium', 'low']);
    expect(ISSUE_RELATION_TYPE_ENUM).toEqual(['blocks', 'blocked_by', 'related', 'duplicate_of']);
    expect(ISSUE_ACTIVITY_TYPE_ENUM).toContain('issue.created');
    expect(ISSUE_ACTIVITY_TYPE_ENUM).toContain('issue.attachment_removed');
  });

  it('should define the expected core issue columns', () => {
    const columns = Object.keys(issues);

    expect(columns.includes('organizationId')).toBe(true);
    expect(columns.includes('projectId')).toBe(true);
    expect(columns.includes('parentIssueId')).toBe(true);
    expect(columns.includes('issueNumber')).toBe(true);
    expect(columns.includes('title')).toBe(true);
    expect(columns.includes('descriptionMarkdown')).toBe(true);
    expect(columns.includes('status')).toBe(true);
    expect(columns.includes('priority')).toBe(true);
    expect(columns.includes('position')).toBe(true);
    expect(columns.includes('estimate')).toBe(true);
    expect(columns.includes('dueAt')).toBe(true);
    expect(columns.includes('resolvedAt')).toBe(true);
    expect(columns.includes('createdBy')).toBe(true);
    expect(columns.includes('updatedBy')).toBe(true);
    expect(columns.includes('deletedAt')).toBe(true);
  });

  it('should enforce inferred row shapes with real type-level samples', () => {
    const issueRow = {
      id: 1,
      organizationId: 1,
      projectId: null,
      parentIssueId: null,
      issueNumber: 101,
      title: 'Issue title',
      descriptionMarkdown: '',
      status: 'backlog',
      priority: 'medium',
      position: 0,
      estimate: null,
      dueAt: null,
      resolvedAt: null,
      createdBy: 1,
      updatedBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    } satisfies Issue;
    const newIssue = {
      organizationId: 1,
      issueNumber: 101,
      title: 'Issue title',
      createdBy: 1,
      updatedBy: 1
    } satisfies NewIssue;
    const assignee = {
      issueId: 1,
      userId: 2,
      assignedByUserId: null
    } satisfies IssueAssignee;
    const watcher = {
      issueId: 1,
      userId: 3,
      addedByUserId: null
    } satisfies IssueWatcher;
    const comment = {
      organizationId: 1,
      issueId: 1,
      authorUserId: 4,
      parentCommentId: null,
      bodyMarkdown: 'Body',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    } satisfies IssueComment;
    const label = {
      organizationId: 1,
      projectId: null,
      name: 'Bug',
      color: '#ef4444',
      description: null,
      createdBy: 5,
      updatedBy: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    } satisfies IssueLabel;
    const labelAssignment = {
      organizationId: 1,
      issueId: 1,
      labelId: 2,
      createdBy: 6,
      createdAt: new Date()
    } satisfies IssueLabelAssignment;
    const relation = {
      organizationId: 1,
      sourceIssueId: 1,
      targetIssueId: 2,
      relationType: 'blocks',
      createdBy: 7,
      createdAt: new Date()
    } satisfies IssueRelation;
    const activity = {
      organizationId: 1,
      issueId: 1,
      actorUserId: null,
      activityType: 'issue.created',
      metadataJson: {},
      createdAt: new Date()
    } satisfies IssueActivity;
    const attachment = {
      organizationId: 1,
      issueId: 1,
      uploadedByUserId: 8,
      fileId: 9,
      storageKey: 'issues/1/file.txt',
      originalFilename: 'file.txt',
      mimeType: null,
      byteSize: 1,
      createdAt: new Date(),
      deletedAt: null
    } satisfies IssueAttachment;

    expect(issueRow.status).toBe('backlog');
    expect(newIssue.issueNumber).toBe(101);
    expect(assignee.userId).toBe(2);
    expect(watcher.userId).toBe(3);
    expect(comment.bodyMarkdown).toBe('Body');
    expect(label.name).toBe('Bug');
    expect(labelAssignment.labelId).toBe(2);
    expect(relation.relationType).toBe('blocks');
    expect(activity.activityType).toBe('issue.created');
    expect(attachment.storageKey).toBe('issues/1/file.txt');
  });

  it('should expose the integrity constraints needed by the issues domain', () => {
    const issuesConfig = getTableConfig(issues);
    const commentsConfig = getTableConfig(issueComments);
    const relationsConfig = getTableConfig(issueRelations);
    const labelsConfig = getTableConfig(issueLabels);
    const labelAssignmentsConfig = getTableConfig(issueLabelAssignments);
    const attachmentsConfig = getTableConfig(issueAttachments);

    expect(
      issuesConfig.indexes.some(
        (tableIndex) =>
          tableIndex.config.name === 'issues_org_id_uidx' && tableIndex.config.unique === true
      )
    ).toBe(true);
    expect(
      commentsConfig.indexes.some(
        (tableIndex) =>
          tableIndex.config.name === 'issue_comments_issue_id_id_uidx' &&
          tableIndex.config.unique === true
      )
    ).toBe(true);
    expect(
      labelsConfig.indexes.some(
        (tableIndex) =>
          tableIndex.config.name === 'issue_labels_org_id_uidx' && tableIndex.config.unique === true
      )
    ).toBe(true);
    expect(
      relationsConfig.foreignKeys.some(
        (foreignKey) => foreignKey.getName() === 'issue_relations_source_issue_org_fk'
      )
    ).toBe(true);
    expect(
      relationsConfig.foreignKeys.some(
        (foreignKey) => foreignKey.getName() === 'issue_relations_target_issue_org_fk'
      )
    ).toBe(true);
    expect(
      commentsConfig.foreignKeys.some(
        (foreignKey) => foreignKey.getName() === 'issue_comments_issue_org_fk'
      )
    ).toBe(true);
    expect(
      labelAssignmentsConfig.foreignKeys.some(
        (foreignKey) => foreignKey.getName() === 'issue_label_assignments_issue_org_fk'
      )
    ).toBe(true);
    expect(
      labelAssignmentsConfig.foreignKeys.some(
        (foreignKey) => foreignKey.getName() === 'issue_label_assignments_label_org_fk'
      )
    ).toBe(true);
    expect(
      attachmentsConfig.foreignKeys.some(
        (foreignKey) => foreignKey.getName() === 'issue_attachments_file_id_files_id_fk'
      )
    ).toBe(true);
    expect(
      attachmentsConfig.indexes.some(
        (tableIndex) => tableIndex.config.name === 'issue_attachments_file_active_idx'
      )
    ).toBe(true);
    expect(labelAssignmentsConfig.columns.some((column) => column.name === 'organization_id')).toBe(
      true
    );
  });
});
